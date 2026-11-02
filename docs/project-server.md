# 服务端（packages/server）

> 状态：P3 完成服务端基础；P4 完成对局运行时、AI worker、LLM 与 TTS 调用、按确认节奏的实时推送与回放。

## 技术选型

Node 22 LTS + Hono（HTTP 与 WebSocket）+ Kysely（pg，类型安全 SQL 构建器，CamelCasePlugin 映射 snake_case 列）。开发运行用 `tsx`。选型理由见设计文档"服务端选型"。

前后端契约：请求与响应 DTO 定义在 `@battle/shared` 的 `api/*`，服务端 zod 校验 schema 以 `satisfies z.ZodType<Dto>` 与之绑定，前端 `services/` 直接使用这些类型（不使用 `hono/client` 推断，契约显式、可读）。

## 目录与分层

```txt
src/
  index.ts          入口：加载配置 → 连接数据库 → 迁移 → 初始化管理员 → 启动 HTTP，处理优雅关闭
  app.ts            路由装配与全局中间件；路由只拿到 service（含 health、realtime），不直接接触仓储或数据库
  container.ts      组合根：创建 repository / service 并注入依赖
  types.ts          Hono 上下文类型（requestId、admin）
  config/env.ts     环境变量校验（错误信息不含取值）
  db/               Kysely 实例、表类型、迁移（db/migrations/*.ts，在 db/migrate.ts 登记）
  middlewares/      requestId、管理员鉴权、统一错误处理
  utils/            统一响应、业务错误、参数校验、加密、日志、通用 CRUD controller/routes
  modules/<name>/   repository / service / controller(或经 utils/crud) / routes / validator
```

- controller 只解析参数、调用 service、包装响应；service 承载业务规则（引用检查、加密、默认值）；repository 只做数据库访问（包括实时播放取座位音色、健康检查的 `select 1`）。
- 资源型模块复用 `utils/crud.ts` 的标准 controller 与 REST 路由，避免四份重复代码。
- 资源的 `enabled`：创建时省略默认 true；更新时省略保留原值（`utils/enabled.ts`）。这样额度耗尽被系统停用的模型不会被一次普通编辑悄悄重新启用。
- 限流来源：`utils/source.ts` 的 `requestSource`，开局限流与登录锁定共用；只有 `TRUST_PROXY=true` 才取 `X-Forwarded-For`。

## 接口

统一响应：成功 `{ code: 0, message: 'ok', data }`；失败 `{ code, message }`，错误码见 `@battle/shared` 的 `API_ERROR_CODES`（40001 参数、40101 未登录、40301 需先改密、40401 不存在、40901 冲突、42901 过于频繁、50000 内部错误、50201 上游服务（模型、语音）不可用）。未知错误只返回通用信息，详情写服务端日志（含 requestId，响应头 `X-Request-Id`）。数据库唯一约束与外键错误转换为 409，不暴露约束名。

| 方法与路径 | 说明 | 鉴权 |
| --- | --- | --- |
| `GET /api/health` | 数据库可用返回 ok，否则 503 | 无 |
| `GET /api/toc/games` | 游戏目录（来自注册表，含变体/板子及其角色构成） | 无 |
| `GET /api/toc/players` | 启用的玩家公开信息（id、name、avatar、persona） | 无 |
| `POST /api/admin/auth/login` | 登录，返回 JWT（12 小时）与是否需改密 | 无 |
| `POST /api/admin/auth/password` | 修改密码（新密码至少 12 位） | 登录（允许未改密） |
| `GET /api/admin/auth/me` | 当前管理员 | 登录（允许未改密） |
| `GET/POST /api/admin/providers`，`GET/PUT/DELETE /api/admin/providers/:id` | 模型供应商（含模型数） | 管理员 |
| 同上 `/api/admin/models` | 模型（供应商、备用模型引用检查；`PUT` 省略 `enabled` 保留原值，`enabled: true` 会清除系统停用原因） | 管理员 |
| `POST /api/admin/models/:id/test` | 连接测试：真实调用一次模型并要求 JSON 回复；失败不报错，结果里给出原因与耗时 | 管理员 |
| 同上 `/api/admin/voices` | 音色（azure / mimo / browser；语言、性别、风格、语速、音调、试听文本、说明） | 管理员 |
| `POST /api/admin/voices/:id/preview` | 试听：按音色参数合成一段文本，返回与对局播放共用的 `/api/media/:id` 地址；浏览器音色返回 400，由前端自己朗读 | 管理员 |
| `POST /api/admin/voices/import-defaults` | 导入内置音色目录（`modules/voices/catalog.ts`，沿用旧版默认语音包），按（来源、音色名、风格）与名称去重，可重复执行 | 管理员 |
| 同上 `/api/admin/players` | AI 玩家（模型、音色引用检查） | 管理员 |
| `POST /api/toc/matches` | C 端开局（`gameKey`、`variant`、`params`、`playerIds`）；每来源每小时 10 局（来源默认是连接地址，`TRUST_PROXY=true` 时才取 `X-Forwarded-For`），进行中的公开对局受 `MAX_ACTIVE_MATCHES` 限制（上限判断与插入在同一事务内用 advisory lock 串行化，并发请求不会一起越过）；公开接口请求体上限 64 KB | 无 |
| `GET /api/toc/matches`、`GET /api/toc/matches/:id` | 已完成的公开对局历史、对局概要（含舞台布局 `layout`，前端不必再查游戏目录；游戏已不在注册表时为 `circle`） | 无 |
| `GET /api/media/:id` | 合成音频（按音色与文本哈希寻址，长期缓存） | 无 |
| `WS /api/toc/ws/matches/:id` | 播放流，见下文"实时推送"；客户端帧超过 16 KB 直接以 1008 关闭 | 无 |
| `GET/POST /api/admin/matches` | 全部对局（筛选 status、debug）/ 创建调试局（seed、breakpoints、pacing、scripted） | 管理员 |
| `GET /api/admin/matches/:id`、`/log`、`/ai-calls` | 详情、完整日志（含私密与 host 频道）、AI 调用记录（分层 prompt、原始响应、耗时） | 管理员 |
| `POST /api/admin/matches/:id/debug`、`DELETE /api/admin/matches/:id` | 调试指令（continue / step / run / skip）、删除对局 | 管理员 |
| `GET /api/admin/games/:key/phases` | 游戏阶段图（阶段、类型、标题、跳转目标），供调试台使用 | 管理员 |

## 鉴权

- 管理员表为空时，用 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 创建首个账号（必须改密）；已有账号时环境变量不会覆盖。未配置时只记录警告。
- 密码用 scrypt（随机盐）存储；JWT 用 HS256 + `JWT_SECRET`，每次请求从数据库读取账号最新状态。
- 未改初始密码的账号只能访问改密与 `me` 接口，其余后台接口返回 40301。
- 登录锁定（进程内滑动窗口计数，过期条目会被清理）：同一来源对同一用户名 15 分钟内失败 10 次后锁定；同一来源对任意用户名累计失败 30 次也锁定。按来源区分，别处猜错密码锁不住正常管理员。

## 密钥

模型供应商的 API Key 用 AES-256-GCM 与 `SECRET_KEY`（32 字节 base64）加密存储，另存末 4 位掩码用于展示；接口永不返回明文，只有服务端内部的 `providers.credentials()` 会解密（供 P4 调用模型）。

## 对局运行时

- **推进**（`modules/matches/runtime.ts`）：一个事务内 `SELECT … FOR UPDATE` 锁定对局行 → 调用引擎 `advance` → 写回快照、新的 AI 任务、舞台事件，以及（来自 worker 时）完成的任务；提交后通过进程内事件总线通知 worker 与实时网关。引擎计算放在 try 内：`EngineInputError` 对 AI 结果视为过期（任务记为 cancelled），对其他输入返回 409；引擎其他异常把对局标为 failed。数据库错误不吞掉，整个事务回滚并向上抛出。完结任务只作用于仍为 queued / running 的任务：迟到的重复结果不会把已 succeeded 的任务改写成 cancelled。
- **AI worker**（`modules/ai-worker`）：事件驱动 + 每秒兜底轮询。`FOR UPDATE SKIP LOCKED` 原子领取任务，领取 10 分钟过期后可被重新领取（大于单个任务的最长耗时，避免重复调用模型），每次领取 `attempts` 加一。执行或推进抛错（如数据库故障）时只记日志等待重新领取；领取次数达到 `AI_TASK_MAX_ATTEMPTS`（默认 3）仍失败则由 `runtime.failMatch` 把对局标为 failed（错误"AI 处理多次失败，对局已终止"）、任务记为 failed、其余任务取消，并通过总线通知在线观众，不再无限重试、重复付费调用模型。`pacing: 'ack'` 的对局只在观众未确认的事件不超过 3 个时才领取，无人观看时自然停止消耗；`free` 不等待（调试、离线跑局）。脚本化对局用引擎的 `scriptedOutput`；否则依次尝试座位玩家的主模型与备用模型中仍启用的部分（主模型被停用时直接用备用模型），每个模型最多 2 次传输层尝试（429 / 5xx / 超时可重试），全部失败交给引擎 `ai_failed` 兜底。每次模型调用写入 `ai_calls`。
- **无人观看回收**（`modules/matches/reaper.ts`）：每分钟把 `MATCH_IDLE_MINUTES` 内没有动静（既没推进也没有观众确认，`updated_at` 在确认时也会刷新）的 ack 节奏公开对局标为 failed 并取消其排队任务，通过总线通知在线观众；调试局不回收。进行中计数也只算这个窗口内有动静的对局。
- **额度耗尽自动停用**：供应商返回 4xx 且错误码在 `modules/llm/quota.ts` 的列表中（百炼 `Arrearage` / `AllocationQuota.FreeTierOnly`、火山 `*BillOverdue`、OpenAI `insufficient_quota` 等）时，LLM 客户端抛出 `quotaExhausted` 的 `LlmError`；worker 不重试，把该模型标为 `enabled = false`、`disabled_reason = 'quota_exhausted'` 并切换备用模型。管理员补充额度后在后台"测试"通过再"重新启用"（`PUT` 时 `enabled: true` 清除原因）。普通限流（429 但没有这些错误码）仍只是重试。
- **LLM**（`modules/llm`）：OpenAI 兼容 Chat Completions，要求 JSON 对象输出，`toChatMessages` 排布分层 prompt；从回复中提取 JSON（兼容代码块），取不出时把原文交给引擎校验并重问。
- **TTS**（`modules/tts`）：Azure（REST，不依赖 SDK；SSML 带语言、`mstts:express-as` 风格、prosody 语速与音调）与 Mimo（OpenAI 兼容；风格作为前置的 user 指令）；`browser` 音色与脚本化对局不合成。音频存入 `media_assets`，按（来源、音色名、语言、风格、语速、音调、文本）哈希去重；对局播放中合成失败只记日志，前端退回浏览器朗读或字幕；后台试听走同一条 `synthesize`，失败则以 50201 把原因返回给管理员。主持播报使用名为"主持人"的音色（没有则不合成）。

## 实时推送

`WS /api/toc/ws/matches/:id`，消息类型定义在 `@battle/shared`（`ClientMessage` / `ServerMessage`）：

1. 客户端连接后发送 `{ type: 'hello', afterSeq }`（10 秒内未发送则从头开始）。
2. 服务端逐个推送 `{ type: 'event', event, audio }`，客户端播放完毕发送 `{ type: 'ack', seq }` 后才推送下一个；推送时预先为之后的 3 个事件准备语音。
3. 暂时没有新事件时推送 `status`（状态没变不重复发）；对局结束且事件推完后推送 `{ type: 'end', result }` 并关闭；失败推送 `status: failed`。推送进行中收到的总线通知会记为"待重查"，本轮结束后再查一次，不会丢掉唤醒。
4. 等待"尚未产生的事件"期间，每 `STREAM_POLL_MS`（默认 2000 毫秒）兜底重查一次数据库：事件总线只在进程内，另一实例的 worker 提交的事件靠它发现；等待观众 ack 期间不查（推送由 ack 驱动），连接关闭时清掉定时器。
5. 断线重连用最后确认的 seq 作为 `afterSeq` 续播；已结束的对局从 0 开始即为回放，与实时走同一条路径。
6. 多个观众时，`matches.acked_seq` 取最大确认值。
7. 客户端帧上限 16 KB（`MAX_CLIENT_FRAME_BYTES`，按 UTF-8 字节计）：超过的帧不解析，直接以 1008（policy violation）关闭。`createNodeWebSocket` 不能透传 ws 的 `maxPayload`，所以检查发生在整帧收到之后；ws 自身的上限仍是默认的 100 MB。

### 多实例限制

数据库层面已经允许多实例（任务领取用 `SKIP LOCKED`，公开开局上限用 advisory lock，播放流有兜底轮询），但以下状态仍是每个进程各自一份：开局限流与登录锁定的计数（`utils/windowCounter.ts`）、TTS 合成的进程内去重（`realtime/audio.ts` 的 inflight）。多实例时限流与锁定的实际阈值会乘以实例数，同一事件的语音可能被不同实例各合成一次（结果仍按哈希去重落库）。把这些计数搬到数据库属于部署阶段（P8）的工作。

## 数据库

PostgreSQL 16，连接时通过 `search_path` 指定 `DATABASE_SCHEMA`（默认 public）。启动时自动执行迁移，失败则拒绝启动。

| 表 | 说明 |
| --- | --- |
| `admin_users` | 管理员 |
| `model_providers` | 供应商（加密的 API Key + 掩码） |
| `models` | 模型参数、备用模型（自引用，删除时置空）、系统停用原因与时间（`disabled_reason` / `disabled_at`，迁移 003） |
| `voices` | 音色：来源、音色名、语言、性别、风格、语速、音调、试听文本、说明（迁移 003） |
| `players` | AI 玩家（模型删除受限，音色删除时置空） |
| `matches` | 对局：游戏、变体、spec 版本与 hash、种子、状态、debug / scripted / pacing、引擎快照、版本号、`last_seq` / `acked_seq`、结果 |
| `match_seats` | 座位 → 玩家、模型、音色（开局时固化，玩家删除后保留名字） |
| `ai_tasks` | AI 请求队列（queued / running / succeeded / failed / cancelled，领取过期时间，领取次数 `attempts`，迁移 004） |
| `match_stage_events` | 按 seq 的舞台事件，实时推送与回放共用 |
| `ai_calls` | 每次模型调用的分层 prompt、原始响应、解析结果、错误、耗时与用量 |
| `media_assets` | 合成音频缓存 |

## 配置

见 `.env.example`：`PORT`（默认 3100）、`DATABASE_URL`、`DATABASE_SCHEMA`、`DATABASE_POOL_MAX`、`JWT_SECRET`（≥32 字符）、`SECRET_KEY`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`（≥12 字符）、`AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION`、`MIMO_API_KEY` / `MIMO_BASE_URL` / `MIMO_TTS_MODEL`、`AI_CONCURRENCY`（默认 4）、`AI_TASK_MAX_ATTEMPTS`（默认 3，一个 AI 任务最多领取几次）、`MAX_ACTIVE_MATCHES`（默认 5）、`MATCH_IDLE_MINUTES`（默认 30）、`STREAM_POLL_MS`（默认 2000，播放流等待新事件时的兜底重查间隔）、`TRUST_PROXY`（默认 false）。`pnpm --filter @battle/server dev` 读取根目录 `.env`。

## 测试

`packages/server/test/`：集成测试连接真实 PostgreSQL（`TEST_DATABASE_URL`，默认本机开发库 `127.0.0.1:5433`），每个测试文件创建独立 schema 并在结束时删除，文件之间串行执行；HTTP 用 `app.request()`，WebSocket 测试会监听随机端口。模型与语音通过 `createServices` 的 `ExternalDeps` 注入假实现。CI 中由 PostgreSQL service 提供数据库。

Kysely 的 `CamelCasePlugin` 必须开启 `maintainNestedObjectKeys`：快照等 jsonb 中以阶段 ID 为键的对象（如 `visits.guard_protect`）不能被改名。

## 与引擎的关系

服务端只通过 `@battle/engine` 公开 API 驱动对局：保存 `advance` 返回的快照，推送 `stageEvents`，把 `aiRequests` 交给 AI worker，再把模型输出以 `ai_result` / `ai_failed` 交回。规则、合法性与胜负全部在引擎内完成，服务端不做任何游戏判断。
