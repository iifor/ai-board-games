# 服务端（packages/server）

> 状态：P3 完成服务端基础；P4 完成对局运行时、AI worker、LLM 与 TTS 调用、按确认节奏的实时推送与回放。

## 技术选型

Node 22 LTS + Hono（HTTP 与 WebSocket）+ Kysely（pg，类型安全 SQL 构建器，CamelCasePlugin 映射 snake_case 列）。开发运行用 `tsx`。选型理由见设计文档"服务端选型"。

前后端契约：请求与响应 DTO 定义在 `@battle/shared` 的 `api/*`，服务端 zod 校验 schema 以 `satisfies z.ZodType<Dto>` 与之绑定，前端 `services/` 直接使用这些类型（不使用 `hono/client` 推断，契约显式、可读）。

## 目录与分层

```txt
src/
  index.ts          入口：加载配置 → 连接数据库 → 迁移 → 初始化管理员 → 启动 HTTP，处理优雅关闭
  app.ts            路由装配与全局中间件
  container.ts      组合根：创建 repository / service 并注入依赖
  types.ts          Hono 上下文类型（requestId、admin）
  config/env.ts     环境变量校验（错误信息不含取值）
  db/               Kysely 实例、表类型、迁移（db/migrations/*.ts，在 db/migrate.ts 登记）
  middlewares/      requestId、管理员鉴权、统一错误处理
  utils/            统一响应、业务错误、参数校验、加密、日志、通用 CRUD controller/routes
  modules/<name>/   repository / service / controller(或经 utils/crud) / routes / validator
```

- controller 只解析参数、调用 service、包装响应；service 承载业务规则（引用检查、加密、默认值）；repository 只做数据库访问。
- 资源型模块复用 `utils/crud.ts` 的标准 controller 与 REST 路由，避免四份重复代码。

## 接口

统一响应：成功 `{ code: 0, message: 'ok', data }`；失败 `{ code, message }`，错误码见 `@battle/shared` 的 `API_ERROR_CODES`（40001 参数、40101 未登录、40301 需先改密、40401 不存在、40901 冲突、42901 过于频繁、50000 内部错误）。未知错误只返回通用信息，详情写服务端日志（含 requestId，响应头 `X-Request-Id`）。数据库唯一约束与外键错误转换为 409，不暴露约束名。

| 方法与路径 | 说明 | 鉴权 |
| --- | --- | --- |
| `GET /api/health` | 数据库可用返回 ok，否则 503 | 无 |
| `GET /api/toc/games` | 游戏目录（来自注册表，含变体/板子） | 无 |
| `GET /api/toc/players` | 启用的玩家公开信息（id、name、avatar、persona） | 无 |
| `POST /api/admin/auth/login` | 登录，返回 JWT（12 小时）与是否需改密 | 无 |
| `POST /api/admin/auth/password` | 修改密码（新密码至少 12 位） | 登录（允许未改密） |
| `GET /api/admin/auth/me` | 当前管理员 | 登录（允许未改密） |
| `GET/POST /api/admin/providers`，`GET/PUT/DELETE /api/admin/providers/:id` | 模型供应商 | 管理员 |
| 同上 `/api/admin/models` | 模型（供应商、备用模型引用检查） | 管理员 |
| 同上 `/api/admin/voices` | 音色（azure / mimo / browser） | 管理员 |
| 同上 `/api/admin/players` | AI 玩家（模型、音色引用检查） | 管理员 |
| `POST /api/toc/matches` | C 端开局（`gameKey`、`variant`、`params`、`playerIds`）；每来源每小时 10 局，进行中的公开对局受 `MAX_ACTIVE_MATCHES` 限制 | 无 |
| `GET /api/toc/matches`、`GET /api/toc/matches/:id` | 已完成的公开对局历史、对局概要 | 无 |
| `GET /api/media/:id` | 合成音频（按音色与文本哈希寻址，长期缓存） | 无 |
| `WS /api/toc/ws/matches/:id` | 播放流，见下文"实时推送" | 无 |
| `GET/POST /api/admin/matches` | 全部对局（筛选 status、debug）/ 创建调试局（seed、breakpoints、pacing、scripted） | 管理员 |
| `GET /api/admin/matches/:id`、`/log`、`/ai-calls` | 详情、完整日志（含私密与 host 频道）、AI 调用记录（分层 prompt、原始响应、耗时） | 管理员 |
| `POST /api/admin/matches/:id/debug`、`DELETE /api/admin/matches/:id` | 调试指令（continue / step / run / skip）、删除对局 | 管理员 |
| `GET /api/admin/games/:key/phases` | 游戏阶段图（阶段、类型、标题、跳转目标），供调试台使用 | 管理员 |

## 鉴权

- 管理员表为空时，用 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 创建首个账号（必须改密）；已有账号时环境变量不会覆盖。未配置时只记录警告。
- 密码用 scrypt（随机盐）存储；JWT 用 HS256 + `JWT_SECRET`，每次请求从数据库读取账号最新状态。
- 未改初始密码的账号只能访问改密与 `me` 接口，其余后台接口返回 40301。
- 同一用户名 15 分钟内失败 10 次后锁定登录（进程内计数）。

## 密钥

模型供应商的 API Key 用 AES-256-GCM 与 `SECRET_KEY`（32 字节 base64）加密存储，另存末 4 位掩码用于展示；接口永不返回明文，只有服务端内部的 `providers.credentials()` 会解密（供 P4 调用模型）。

## 对局运行时

- **推进**（`modules/matches/runtime.ts`）：一个事务内 `SELECT … FOR UPDATE` 锁定对局行 → 调用引擎 `advance` → 写回快照、新的 AI 任务、舞台事件，以及（来自 worker 时）完成的任务；提交后通过进程内事件总线通知 worker 与实时网关。引擎计算放在 try 内：`EngineInputError` 对 AI 结果视为过期（任务记为 cancelled），对其他输入返回 409；引擎其他异常把对局标为 failed。数据库错误不吞掉，整个事务回滚并向上抛出。
- **AI worker**（`modules/ai-worker`）：事件驱动 + 每秒兜底轮询。`FOR UPDATE SKIP LOCKED` 原子领取任务，领取 2 分钟过期后可被重新领取。`pacing: 'ack'` 的对局只在观众未确认的事件不超过 3 个时才领取，无人观看时自然停止消耗；`free` 不等待（调试、离线跑局）。脚本化对局用引擎的 `scriptedOutput`；否则依次尝试座位玩家的主模型与备用模型，每个模型最多 2 次传输层尝试（429 / 5xx / 超时可重试），全部失败交给引擎 `ai_failed` 兜底。每次模型调用写入 `ai_calls`。
- **LLM**（`modules/llm`）：OpenAI 兼容 Chat Completions，要求 JSON 对象输出，`toChatMessages` 排布分层 prompt；从回复中提取 JSON（兼容代码块），取不出时把原文交给引擎校验并重问。
- **TTS**（`modules/tts`）：Azure（REST，不依赖 SDK）与 Mimo（OpenAI 兼容）；`browser` 音色与脚本化对局不合成。音频存入 `media_assets`，按（音色、文本）哈希去重；合成失败只记日志，前端退回浏览器朗读或字幕。主持播报使用名为"主持人"的音色（没有则不合成）。

## 实时推送

`WS /api/toc/ws/matches/:id`，消息类型定义在 `@battle/shared`（`ClientMessage` / `ServerMessage`）：

1. 客户端连接后发送 `{ type: 'hello', afterSeq }`（10 秒内未发送则从头开始）。
2. 服务端逐个推送 `{ type: 'event', event, audio }`，客户端播放完毕发送 `{ type: 'ack', seq }` 后才推送下一个；推送时预先为之后的 3 个事件准备语音。
3. 暂时没有新事件时推送 `status`；对局结束且事件推完后推送 `{ type: 'end', result }` 并关闭；失败推送 `status: failed`。
4. 断线重连用最后确认的 seq 作为 `afterSeq` 续播；已结束的对局从 0 开始即为回放，与实时走同一条路径。
5. 多个观众时，`matches.acked_seq` 取最大确认值。

## 数据库

PostgreSQL 16，连接时通过 `search_path` 指定 `DATABASE_SCHEMA`（默认 public）。启动时自动执行迁移，失败则拒绝启动。

| 表 | 说明 |
| --- | --- |
| `admin_users` | 管理员 |
| `model_providers` | 供应商（加密的 API Key + 掩码） |
| `models` | 模型参数、备用模型（自引用，删除时置空） |
| `voices` | 音色 |
| `players` | AI 玩家（模型删除受限，音色删除时置空） |
| `matches` | 对局：游戏、变体、spec 版本与 hash、种子、状态、debug / scripted / pacing、引擎快照、版本号、`last_seq` / `acked_seq`、结果 |
| `match_seats` | 座位 → 玩家、模型、音色（开局时固化，玩家删除后保留名字） |
| `ai_tasks` | AI 请求队列（queued / running / succeeded / failed / cancelled，领取过期时间） |
| `match_stage_events` | 按 seq 的舞台事件，实时推送与回放共用 |
| `ai_calls` | 每次模型调用的分层 prompt、原始响应、解析结果、错误、耗时与用量 |
| `media_assets` | 合成音频缓存 |

## 配置

见 `.env.example`：`PORT`（默认 3100）、`DATABASE_URL`、`DATABASE_SCHEMA`、`DATABASE_POOL_MAX`、`JWT_SECRET`（≥32 字符）、`SECRET_KEY`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`（≥12 字符）、`AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION`、`MIMO_API_KEY` / `MIMO_BASE_URL` / `MIMO_TTS_MODEL`、`AI_CONCURRENCY`（默认 4）、`MAX_ACTIVE_MATCHES`（默认 5）。`pnpm --filter @battle/server dev` 读取根目录 `.env`。

## 测试

`packages/server/test/`：集成测试连接真实 PostgreSQL（`TEST_DATABASE_URL`，默认本机开发库 `127.0.0.1:5433`），每个测试文件创建独立 schema 并在结束时删除，文件之间串行执行；HTTP 用 `app.request()`，WebSocket 测试会监听随机端口。模型与语音通过 `createServices` 的 `ExternalDeps` 注入假实现。CI 中由 PostgreSQL service 提供数据库。

Kysely 的 `CamelCasePlugin` 必须开启 `maintainNestedObjectKeys`：快照等 jsonb 中以阶段 ID 为键的对象（如 `visits.guard_protect`）不能被改名。

## 与引擎的关系

服务端只通过 `@battle/engine` 公开 API 驱动对局：保存 `advance` 返回的快照，推送 `stageEvents`，把 `aiRequests` 交给 AI worker，再把模型输出以 `ai_result` / `ai_failed` 交回。规则、合法性与胜负全部在引擎内完成，服务端不做任何游戏判断。
