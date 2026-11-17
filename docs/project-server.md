# 服务端（packages/server）

迁移 `022_player_identity` 允许 `players.name` 为 NULL，已有昵称继续受唯一约束保护，并把旧玩家的内置立绘标识保存到 `appearance_name`。开局时读取绑定模型，在座位记录和引擎快照写入同一显示名。之后换绑模型只影响新局。导入回放使用剧本姓名。

玩家发言与评委点评在 AI worker 调用模型前通过 `speechDelivery` 按座位查询启用音色，组合 Azure `StyleList` 的中文标签和 `azureControlCapabilities` 中已实测的暂停、语速、音高控制。实际发送的提示词写入 AI 调用 Trace；模型原始响应保留，交回引擎的发言/点评会归一化标签并去掉越界控制。普通座号如 `[3号]` 与非控制用途的中文书名括号保留。该步骤不新增模型调用，目录与合成共用缓存。当前能力测于 `eastasia`，新增音色或区域需要重新实测再开放精确控制，详见[音色实测报告](operations/azure-controls-20261114.md)。

Azure 合成前通过供应商的可选 `prepare` 步骤解析中文情绪与控制标签，如 `[冷静]`、`【愤怒】`、`[短停]`、`[放慢]`。标签不进入朗读正文，每段风格持续至下一个风格标签，`[自然]` 显式恢复自然风格。风格按当前区域目录校验，音色不支持时使用目录支持的配置默认风格，否则使用自然风格。目录查询失败会记录警告并用自然风格继续合成。无标签文本不查询目录；后台目录与合成共用同一缓存实例。分段结果在同一个音色的 SSML 中表达，暂停为一次性指令，语速和音高偏移相对音色配置计算；只有已实测的控制属性会进入 SSML。带标签的缓存键包含清理后的正文、分段参数和控制能力，避免命中以前读出标签的音频，也能区分能力变化后的音频。只含标签的试听返回参数错误。

视角管理使用受管理员认证保护的只读接口。以 `/api/admin/perspectives` 为前缀，`GET /actions` 列出夜间私密指令及对应叫号，`GET /matches` 分页列出狼人杀对局，`GET /matches/:id` 返回事件、当时的接收范围和行动请求，`GET /matches/:id/requests/:request` 返回该局保存的请求上下文。删除调用链后无法再通过这些接口读取请求。

跨游戏的玩家发言与情绪表达模板使用目录键 `system/playerExpression`，复用提示词目录的编辑、预览及修订号校验。服务端在开局时把当前文案写入快照。

管理员使用 `GET /api/admin/announcements` 查看狼人杀法官台词和辩题公布，使用 `PUT /api/admin/announcements/:key` 提交 `{ text, revision }`。传入 null 恢复默认。服务端核验文案、变量与修订号，并发编辑冲突返回 409。迁移 017 建立 `announcement_templates`，按玩法和播报键保存自定义文案及修订号。辩题公布沿用 `prompt_templates` 的 `debate/topicAnnounce` 文案和修订号，接口键为 `debate.topicAnnounce`。`POST /api/admin/announcements/:key/preview` 接受 `{ text }`，用公开辩题样例返回 `{ text }` 渲染结果。开局时将当前覆盖项写入引擎快照，后续推进和历史回放无需读取最新配置。

管理员提示词目录位于 `/api/admin/prompts`。GET 根路径列出模型使用的游戏规则、身份、阶段任务、平台契约及模型测试、剧本识别两项工具指令。GET `/:group/:key` 返回模板源码及可选上下文，阶段任务最多附带最近 12 条请求记录。POST `/:group/:key/preview` 使用服务端选定的样例或历史请求渲染。所有目录模板的内置样例都接受可选的草稿源码，复用原版样例的变量渲染草稿。固定文本样例使用空变量上下文。预览不会调用模型。历史记录优先展示实际使用的模板，旧请求缺失源码时只显示当时实际发送的任务。后台删除调用链后不能再读取这些历史数据。

PUT `/:group/:key` 接受 `{ source, revision }`，用内置样例校验后返回新修订号，过期写入返回 409。迁移 018 增加目录设置和保存顺序，并为在途旧局保留升级时已生效的调试配置。各开局入口在创建事务中读取适用的目录、板子与播报配置并写入本局快照。纯主持播报通过播报接口维护。

POST `/:group/:key/compare` 接受样例引用、模板草稿与模型配置 ID。服务端仅在「白天发言」「攻辩提问」开放这一操作，校验渲染结果后，在同一座位、模型和参数下分别执行原版与草稿。目录实验不写入对局、调用链或发布记录。所有目录接口均要求后台鉴权，并标记 `private, no-store`。

管理员通过 `GET /api/admin/traces/:id/requests/:request/comparisons` 获取历史人设、只读身份和最近十次实验；同路径 POST 运行一次对比。模型来源为本请求下的历史调用 ID 或一个启用的配置 ID。服务端从原始任务恢复六层提示词，固定一套供应商连接与采样参数并顺序调用两次。对比结果存入迁移 013 的 `prompt_comparisons`，不计入原局模型用量；清除调用链或删除对局时清理这些记录。对比校验使用历史 JSON Schema 与合法目标，不推进引擎。

管理员可向同路径的 `/:comparison/apply` 发起 POST，应用对应请求下已生成修改版回答的模板实验。服务端从保存的实验读取实际测试过的模板和人设差异。迁移 015 的 `applied_prompts` 按游戏、板子、模板名唯一，重复应用同一记录幂等。新建对局锁定这个板子适用的模板和人设。目录和调试配置按最近一次适用的保存生效。行动时渲染失败会留下管理端诊断并回退到基础模板。清除实验记录不删除已生效配置。

`/api/admin/replay-imports` 全部使用后台鉴权。`POST /parse` 接收 multipart 文件和 gameKey，`POST /suggest` 提供选中原文的模型候选，`POST /preview` 返回逐事件视图和播放起点。根路径支持 GET 列表、POST 保存；`/:id` 支持 GET、按 revision 的 PUT；`POST /:id/publish` 锁定草稿，在同一事务写入已结束的对局、座位和事件。迁移 012 新增 `replay_imports` 和 `matches.import_title`。详见[剧本说明](./replay-import.md)。

狼人杀 WebSocket 默认推送上帝视角。连接 `/api/toc/ws/matches/:id?seat=N` 时，服务端校验座位，推送公开事件，以及 `private:N` 中的法官播报和由 N 执行的行动。视图显示自己的身份和已公开翻牌。服务端自动确认其余事件。语音预取按相同范围过滤，字幕和记录使用投影后的事件。进行中与回放使用相同规则。丘比特 `cupid_bond` 阶段的私密情侣通知保留在后台日志及玩家私密认知中，播放流对所有观战视角跳过此类通知、自动确认进度，语音预取也跳过；连线行动与其他私讯仍按原有可见性处理。

狼人杀旧事件缺少 `publicRoles` 时，玩家视角仍遮住其他座位的暗牌。全员翻牌事件和终局可以显示全员身份。带有公开台词的阶段使用主持人音色。

> 状态：P3 完成服务端基础；P4 完成对局运行时、AI worker、LLM 与 TTS 调用、按确认节奏的实时推送与回放。

迁移 016 给玩家增加可选的温度、输出预算和发言篇幅。玩家配置及人设建议随座位快照保存，发言及评委点评通过提示词采用座位的建议篇幅。同一玩家的各轮、重试及备用模型沿用该温度与预算，实际请求的 tokens 上限取玩家预算与所用模型上限的较小值。迁移 019 将原默认模型上限 4096 提至 8192，并将已保存的玩家预算翻倍至最多 32000。新局采纳升级后的预算，已保存的对局和调用快照保留原值。历史请求对比沿用所选调用的记录参数。连接探测与文档解析使用各自的工具参数。

## 技术选型

Node 22 LTS + Hono（HTTP 与 WebSocket）+ Kysely（pg，类型安全 SQL 构建器，CamelCasePlugin 映射 snake_case 列）。开发运行用 `tsx`。选型理由见设计文档"服务端选型"。

前后端契约：请求与响应 DTO 定义在 `@battle/shared` 的 `api/*`，服务端 zod 校验 schema 以 `satisfies z.ZodType<Dto>` 与之绑定，前端 `services/` 直接使用这些类型（不使用 `hono/client` 推断，契约显式、可读）。

## 目录与分层

```txt
src/
  index.ts          入口：加载配置 → 连接数据库 → 迁移 → 初始化管理员 → 启动跨实例通知监听 → 启动 HTTP，处理有上限的优雅关闭（见"优雅关闭"）
  app.ts            路由装配与全局中间件；路由只拿到 service（含 health、realtime），不直接接触仓储或数据库
  container.ts      组合根：创建 repository / service 并注入依赖；每次调用就是一个实例（生成实例 ID、跨实例总线）
  types.ts          Hono 上下文类型（requestId、admin、access）
  config/env.ts     环境变量校验（错误信息不含取值）
  db/               Kysely 实例、表类型、迁移（db/migrations/*.ts，在 db/migrate.ts 登记）、advisory lock 键（locks.ts）、LISTEN/NOTIFY 传输层（notifier.ts）
  middlewares/      requestId、管理员鉴权、C 端开局凭证校验、统一错误处理
  utils/            统一响应、业务错误、参数校验、加密、日志、通用 CRUD controller/routes、事件总线（进程内 eventBus 与跨实例 pgEventBus）、滑动窗口存储接口（windowStore）
  modules/<name>/   repository / service / controller(或经 utils/crud) / routes / validator
```

- controller 只解析参数、调用 service、包装响应；service 承载业务规则（引用检查、加密、默认值）；repository 只做数据库访问（包括实时播放取座位音色、健康检查的 `select 1`）。
- 资源型模块复用 `utils/crud.ts` 的标准 controller 与 REST 路由，避免四份重复代码。
- 资源的 `enabled`：创建时省略默认 true；更新时省略保留原值（`utils/enabled.ts`）。这样额度耗尽被系统停用的模型不会被一次普通编辑悄悄重新启用。
- 限流来源：`utils/source.ts` 的 `requestSource`，登录锁定、身份码输错锁定与本地调试开局限流共用；只有 `TRUST_PROXY=true` 才取 `X-Forwarded-For`，且只取最右一项（唯一一层可信代理追加的对端地址；左侧各项可被客户端伪造）。代理之后却保持 false 会让所有人共用代理地址，一人输错即锁住所有人。公开开局按身份码限流，不看来源。这些计数都放在 `request_windows` 表（`modules/limits`），多实例共享，见"多实例"。

## 接口

统一响应：成功 `{ code: 0, message: 'ok', data }`；失败 `{ code, message }`，错误码见 `@battle/shared` 的 `API_ERROR_CODES`（40001 参数、40101 未登录、40301 需先改密、40401 不存在、40901 冲突、42901 过于频繁、50000 内部错误、50201 上游服务（模型、语音）不可用）。未知错误只返回通用信息，详情写服务端日志（含 requestId，响应头 `X-Request-Id`）。数据库唯一约束与外键错误转换为 409，不暴露约束名。

| 方法与路径 | 说明 | 鉴权 |
| --- | --- | --- |
| `GET /api/health` | 数据库可用返回 `{ status: 'ok', instance }`（`instance` 是应答实例启动时生成的随机 ID），否则 503 | 无 |
| `GET /api/toc/games` | 游戏目录（来自注册表，含变体及角色构成；固定公开席位的游戏另含有序的 `seatGroups`） | 无 |
| `GET /api/toc/players` | 已启用、且主模型或备用模型可用（模型启用且所属供应商启用，与 AI worker 的模型链一致）的玩家；模型因额度耗尽被自动停用后不再出现。返回玩家 ID、模型显示名、完整模型标识、立绘标识、头像和人设 | 无 |
| `POST /api/admin/auth/login` | 登录，返回 JWT（12 小时）与是否需改密 | 无 |
| `POST /api/admin/auth/password` | 修改密码（新密码至少 12 位）；吊销该账号所有已签发令牌，返回给当前会话的新令牌（结构同登录） | 登录（允许未改密） |
| `POST /api/admin/auth/logout` | 退出登录：吊销该账号所有已签发令牌（所有设备一起退出） | 登录（允许未改密） |
| `GET /api/admin/auth/me` | 当前管理员 | 登录（允许未改密） |
| `GET/POST /api/admin/providers`，`GET/PUT/DELETE /api/admin/providers/:id` | 模型供应商（含模型数） | 管理员 |
| 同上 `/api/admin/models` | 模型（供应商、备用模型引用检查；`PUT` 省略 `enabled` 保留原值，`enabled: true` 会清除系统停用原因） | 管理员 |
| `POST /api/admin/models/:id/test` | 连接测试：真实调用一次模型并要求 JSON 回复；失败不报错，结果里给出原因与耗时 | 管理员 |
| `GET /api/admin/models/catalog/:providerId` | 服务端使用已保存的密钥访问已启用供应商的 Base URL 下的 `/models`，返回去重的远端 ID 和已添加标记。上游错误仅返回状态提示 | 管理员 |
| `POST /api/admin/models/catalog/:providerId/import` | 将勾选的 ID 在一个事务内按默认参数创建，同供应商的同一 ID 跳过，展示名冲突时自动区分 | 管理员 |
| 同上 `/api/admin/voices` | 音色（azure / mimo / browser；语言、风格、语速、音调、试听文本、说明）。`gender` 是目录标签，更新时省略会保留原值。 | 管理员 |
| `POST /api/admin/voices/:id/preview` | 试听：按音色参数合成一段文本，返回与对局播放共用的 `/api/media/:id` 地址；浏览器音色返回 400，由前端自己朗读 | 管理员 |
| `POST /api/admin/voices/import-defaults` | 导入内置音色目录（`modules/voices/catalog.ts`，沿用旧版默认语音包），按（来源、音色名、风格）与名称去重，可重复执行 | 管理员 |
| `GET /api/admin/voices/azure/catalog` | 使用服务端 Azure 语音密钥及区域读取官方音色目录，返回音色标识与支持的风格。成功结果在服务实例缓存 10 分钟，并发请求合并；失败不缓存，未配置、超时或上游错误返回 50201。HTTP 响应为 `private, no-store`。 | 管理员 |
| 同上 `/api/admin/players` | AI 玩家（模型、音色引用检查） | 管理员 |
| `GET/POST /api/admin/access-codes`，`PUT/DELETE /api/admin/access-codes/:id`，`POST /api/admin/access-codes/:id/regenerate` | 身份码：列表、新建（`username`、`expiresAt`、`maxMatches`）、编辑（可同时停用）、删除、重新生成。新建与重新生成的响应含一次性明文码 `secret`，标记 `private, no-store` | 管理员 |
| `POST /api/toc/matches` | C 端开局（`gameKey`、`variant`、`params`、`playerIds`），需要 `Authorization: Bearer <开局凭证>`（见"身份码"）。每个身份码每小时 10 局；进行中的公开对局受 `MAX_ACTIVE_MATCHES` 限制；上限判断、身份码局数扣减与插入在同一事务内用 advisory lock 串行化，并发请求不会一起越过，开局失败不扣局数；公开接口请求体上限 64 KB；非脚本化对局的每个玩家都必须有可用的主模型或备用模型，否则 400 | 开局凭证 |
| `POST /api/toc/access/session` | 用身份码 `{ code }` 换取开局凭证，返回 `token`、`tokenExpiresAt`、用户名、身份码有效期与剩余局数；输入不区分大小写，忽略空格与连字符。同一来源 15 分钟内输错 10 次后锁定 | 无 |
| `GET /api/toc/access/me` | 凭证对应的用户名、有效期与剩余局数（`null` 为不限） | 开局凭证 |
| `GET /api/toc/matches`、`GET /api/toc/matches/:id` | 已完成的公开对局历史、对局概要（含舞台布局 `layout`，前端不必再查游戏目录；游戏已不在注册表时为 `circle`）。调试局的可见性见"调试局对外可见性" | 无 |
| `GET /api/media/:id` | 合成音频（按音色与文本哈希寻址，长期缓存） | 无 |
| `WS /api/toc/ws/matches/:id` | 播放流，见下文"实时推送"；客户端帧超过 16 KB 直接以 1008 关闭；对局可见性与 `GET /api/toc/matches/:id` 同一口径 | 无 |
| `GET/POST /api/admin/matches` | 全部对局（按 status、source（normal / debug / import）筛选，兼容 debug；来源基于 importTitle 和 debug 判断，limit、offset 分页，按创建时间和 ID 倒序；对局与座位各查一次）/ 创建调试局（seed、breakpoints、pacing、scripted、chaos；`chaos: true` 必须同时 `scripted: true`，否则 40001） | 管理员 |
| `GET /api/admin/matches/:id`、`/log`、`/ai-calls` | 详情、完整日志（含私密与 host 频道）、AI 调用记录（分层 prompt、原始响应、耗时） | 管理员 |
| `POST /api/admin/matches/:id/debug`、`DELETE /api/admin/matches/:id` | 调试指令（continue / step / run / skip）、删除对局 | 管理员 |
| `GET /api/admin/games/:key/phases` | 游戏阶段图（阶段、类型、标题、跳转目标），供调试台使用 | 管理员 |

### 调试局对外可见性

开发环境另提供 `POST /api/toc/matches/local-debug`，接收 `gameKey`、可选 `variant` 与 `params`。仅接受来自本机回环地址的 JSON 请求，校验请求主机与浏览器 Origin，沿用开局频率限制。服务端固定使用自动阵容、脚本化与连续生成，生产环境不注册此入口。管理后台可在原调试开局接口提交 `generatePlayers: true` 和 `scripted: true`，此时必须省略 `playerIds`。生成座位仅保存在本局快照与座位表中，玩家、模型、音色外键均为空。

调试局（`debug = true`）从不出现在公开历史列表里；按 ID 的公开概要与播放流是否能看到它由 `MatchService` 的 `debugVisibleToPublic` 决定（组合根按 `NODE_ENV` 注入，不是全局变量）：生产环境视为不存在（概要 404，播放流回 `error: 对局不存在`），开发与测试环境可见，因为验收脚本化调试局时要用 C 端舞台观看。后台接口不受影响。播放流的 `find` 走 `MatchService.findPublic`，与概要接口共用同一判断。

## 鉴权

- 管理员表为空时，用 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 创建首个账号（必须改密）；已有账号时环境变量不会覆盖。未配置时只记录警告。创建在持 advisory lock 的事务里再查一次表，多实例同时启动只会创建一个账号。
- 密码用 scrypt（随机盐）存储；JWT 用 HS256 + `JWT_SECRET`，每次请求从数据库读取账号最新状态。
- 后台令牌载荷含 `gen`（签发时 `admin_users.token_generation`，迁移 027），必须等于账号当前代次；改密与退出登录时代次加一，已签发的令牌立即失效（包括用初始密码登录、尚未改密的其他会话）。迁移 027 之前签发的令牌没有 `gen`，升级后需要重新登录一次。
- 未改初始密码的账号只能访问改密与 `me` 接口，其余后台接口返回 40301。
- 登录锁定（滑动窗口计数，存在 `request_windows` 表里，多实例共享）：同一来源对同一用户名 15 分钟内失败 10 次后锁定；同一来源对任意用户名累计失败 30 次也锁定。按来源区分，别处猜错密码锁不住正常管理员。每个实例同时最多 4 个登录校验（`MAX_CONCURRENT_PASSWORD_CHECKS`），先占名额再查锁定，超出直接 429、不跑 scrypt：并发请求越过"先查后记"窗口的次数有上限，登录洪水也不会占满 libuv 线程池。
- 后台令牌与 C 端开局凭证共用 `JWT_SECRET`，用 `aud` 区分（`admin` / `access`），各自的中间件只接受自己的 audience，开局凭证不能访问后台，后台令牌也不能开局。迁移 026 之前签发的后台令牌没有 `aud`，升级后需要重新登录一次。

## 身份码

C 端开局会调用模型，需要管理员发放的身份码；观战、直播与回放仍然公开。模块位于 `modules/access-codes`。

- 管理员在后台新建身份码，填写用户名、有效期（最长 366 天）和可选的局数上限。明文码为 16 位（去掉易混淆字符的 30 个字符，4 位一组），只在新建和重新生成时返回一次；库里只存 SHA-256 与末 4 位。
- C 端用身份码换取开局凭证（JWT，`aud: access`，载荷含身份码 ID 与 `generation`），有效期取 30 天与身份码有效期中较早者。
- 每次使用凭证都重新读取身份码：停用、过期、重新生成（`generation` 递增）或删除后立即返回 40101，前端据此清除凭证并要求重新输码。局数用完返回 40302，凭证本身仍可查询剩余局数。
- 开局扣减在开局事务内用一条带条件的 `UPDATE` 完成（未停用、未过期、`generation` 一致、未超上限），并发开局不会越过上限，开局失败整体回滚。
- 对局记录 `matches.access_code_id`；后台对局详情的 `startedBy` 显示发起人，身份码删除后置空。
- 身份码不在配置导出范围内，跨环境迁移后需要重新发放。

## 密钥

配置跨环境迁移使用根目录的 `config:export` / `config:import` 命令。模块按配置白名单读取，在同一快照导出，并加密整份文件。导入在事务中保留 ID、恢复备用模型及玩家绑定、校正自增与发布序列；目标配置表和对局表须为空。供应商密钥可通过 `CONFIG_SOURCE_SECRET_KEY` 解包后用目标 `SECRET_KEY` 重加密。配置文件不包含历史对局、玩家记忆或管理员账号，详见 [配置迁移](operations/config-transfer.md)。

模型供应商的 API Key 用 AES-256-GCM 与 `SECRET_KEY`（32 字节 base64）加密存储，另存末 4 位掩码用于展示；接口永不返回明文，只有服务端内部的 `providers.credentials()` 会解密（供 P4 调用模型）。更新时省略 Key 保留原密钥，但接口地址换到别的域名（origin 不同）时必须同时提供新 Key，否则 400：防止只改地址再点"测试"把原 Key 发到别处。模型调用与目录请求都不跟随重定向（`redirect: 'error'`）。

## 对局运行时

- **推进**（`modules/matches/runtime.ts`）：一个事务内 `SELECT … FOR UPDATE` 锁定对局行 → 调用引擎 `advance` → 写回快照、新的 AI 任务、舞台事件，以及（来自 worker 时）完成的任务；提交后通过事件总线通知 worker 与实时网关（总线跨实例，见"多实例"）。引擎计算放在 try 内：`EngineInputError` 对 AI 结果视为过期（任务记为 cancelled），对其他输入返回 409；`SpecMismatchError`（快照来自旧版本的游戏定义，见下文"部署与游戏版本"）立即把对局标为 failed（错误"游戏规则已更新，这局无法继续，已终止"，触发的任务记为 cancelled）；引擎其他异常把对局标为 failed。后两种情况都会取消该局其余未完成的任务，与 `failMatch` 共用同一段终止逻辑。数据库错误不吞掉，整个事务回滚并向上抛出。完结任务只作用于仍为 queued / running 的任务：迟到的重复结果不会把已 succeeded 的任务改写成 cancelled。
- **AI worker**（`modules/ai-worker`）：事件驱动（总线跨实例唤醒）+ 每秒兜底轮询（处理重试、过期领取与丢失的通知）。`FOR UPDATE SKIP LOCKED` 原子领取任务，领取 10 分钟过期后可被重新领取（大于单个任务的最长耗时，避免重复调用模型），每次领取 `attempts` 加一。执行或推进抛错（如数据库故障）时只记日志等待重新领取；领取次数达到 `AI_TASK_MAX_ATTEMPTS`（默认 3）仍失败则由 `runtime.failMatch` 把对局标为 failed（错误"AI 处理多次失败，对局已终止"）、任务记为 failed、其余任务取消，并通过总线通知在线观众，不再无限重试、重复付费调用模型。`pacing: 'ack'` 的对局只在观众未确认的事件不超过 3 个时才领取，无人观看时自然停止消耗；`free` 不等待（调试、离线跑局）。脚本化对局用引擎的 `scriptedOutput`；开启混沌脚本（`chaos`）的脚本化对局改用引擎的 `chaosReply`：按对局种子与请求 ID 以固定概率弃票、放弃可放弃的动作、附带自爆等声明、给出非法输出（引擎重问后再兜底）或模拟一次调用失败——模拟失败是一次"已完成但失败"的任务（任务记为 failed、以 `ai_failed` 交回引擎走兜底，对局继续），不是执行异常，不计入下面的领取次数上限。否则依次尝试座位玩家的主模型与备用模型中仍启用的部分（主模型被停用时直接用备用模型），每个模型首次调用后最多重试两次，间隔 0.5 秒、1 秒；网络中断、超时、HTTP 408、临时限流（429）、5xx 和空内容可重试，全部失败交给引擎 `ai_failed` 兜底。每次模型调用写入 `ai_calls`（脚本化与混沌对局不写）。发言与点评落库前按座位音色整理朗读标记（`speechDelivery.ts`）：已登记的情绪 / 控制标签换成当前音色支持的写法，不支持的移除；未登记的方括号内容（`[3号]`、`[查杀]`、`[金水]`）是正文，原样保留。
- **优雅关闭**（`src/index.ts`）：收到 SIGINT / SIGTERM 后先停回收器，再 `worker.stop()`：不再领取新任务，等待进行中的任务最多 `SHUTDOWN_TIMEOUT_MS`（默认 10 秒），超时则记录还没结束的任务（matchId、requestId）并继续关闭——它们的领取在 10 分钟后过期，由下一个实例重新领取。随后关闭跨实例通知的监听连接、HTTP 监听与连接池；整个关闭流程超过 2 倍 `SHUTDOWN_TIMEOUT_MS` 仍没结束（例如被卡住的任务占着连接）就直接退出。
- **无人观看回收**（`modules/matches/reaper.ts`）：每分钟把 `MATCH_IDLE_MINUTES` 内没有动静（既没推进也没有观众确认；只有确认进度真正前进时才刷新 `updated_at`，重连或重复确认同一位置不算，任何人反复连上来都不能让无人观看的对局一直占着名额）的 ack 节奏公开对局标为 failed 并取消其排队任务，通过总线通知在线观众；调试局不回收。进行中计数也只算这个窗口内有动静的对局。每次清扫先在事务里拿 `pg_try_advisory_xact_lock`，拿不到（另一实例正在扫）就跳过，`sweep()` 返回 null。
- **额度耗尽自动停用**：供应商返回 4xx 且错误码在 `modules/llm/quota.ts` 的列表中（百炼 `Arrearage` / `AllocationQuota.FreeTierOnly`、火山 `*BillOverdue`、OpenAI `insufficient_quota` 等）时，LLM 客户端抛出 `quotaExhausted` 的 `LlmError`；worker 不重试，把该模型标为 `enabled = false`、`disabled_reason = 'quota_exhausted'` 并切换备用模型。管理员补充额度后在后台"测试"通过再"重新启用"（`PUT` 时 `enabled: true` 清除原因）。普通限流（429 但没有这些错误码）仍只是重试。
- **LLM**（`modules/llm`）：OpenAI 兼容 Chat Completions，要求 JSON 对象输出，`toChatMessages` 排布分层 prompt；从回复中提取 JSON（兼容代码块），取不出时把原文交给引擎校验并重问。
- **模型参数兼容**：官方 OpenAI 使用 `max_completion_tokens`（包括推理和可见输出），其他兼容端点默认使用 `max_tokens`。只有上游 400 明确要求替换旧字段，或明确拒绝自定义温度时，才按提示调整并重发；不移除输出上限和 JSON 要求。后台连接测试和实际对局共用该逻辑。连接测试最多使用 512 个输出 token，且不超过该模型的配置；耗尽预算但没有可见内容时会提示原因。
- **TTS**（`modules/tts`）：Azure（官方 Speech SDK，同次合成取得音频与 WordBoundary 时间戳；SSML 带语言、`mstts:express-as` 风格、prosody 语速与音调）与 Mimo（OpenAI 兼容；风格作为前置的 user 指令）；`browser` 音色与脚本化对局不合成。哪些舞台事件朗读、读什么，由 `@battle/shared` 的 `speechOf` 决定（`realtime/audio.ts` 直接调用，与客户端的浏览器朗读同一口径）：玩家发言按座位音色；评委判定连同点评一起读（`判定。点评`）按座位音色；播报、揭示、行动（开枪、自爆……）、终局总结由名为"主持人"的音色读（没有则不合成）；带公开主持台词的阶段按台词朗读，其余阶段标题、计票、出局、兜底记录不朗读。音频存入 `media_assets`，按（来源、合成器签名、音色名、语言、风格、语速、音调、文本）哈希去重——合成器签名是每个 `TtsProvider` 的 `signature`（Mimo 为模型名与音频格式，Azure 为输出格式与字幕协议版本），换模型不会命中旧缓存；同一音频只合成一次：进程内用按音频 ID 的 inflight 表去重，跨实例由仓储的 `locked(id, work)` 在持 `pg_advisory_xact_lock(hashtext(id))` 的事务里"再查 → 合成 → 写入"，后到的实例等锁释放后发现缓存已在；对局播放中合成失败只记日志，前端退回浏览器朗读或字幕；后台试听走同一条 `synthesize`，失败则以 50201 把原因返回给管理员。

## 实时推送

Azure 字幕由 `azureTransport` 使用官方 SDK 在同一次合成中接收 WordBoundary 与 MP3，音频偏移和时长由 100ns ticks 转为毫秒。`azureCaptions` 对齐清理后的正文，按共享分句规则生成 `{ text, startMs, endMs }`；缺失、无效或无法完整覆盖正文的元数据不返回字幕时间轴，客户端自动使用估算。没有新增识别或模型调用。SDK 每次合成独立关闭连接，沿用 TTS 超时。

迁移 `021_media_captions` 为 `media_assets` 新增可空的 JSONB `captions`，音频与时间轴在同一个持锁事务写入；缓存快查只读 MIME 与时间轴，跨实例等锁后的查询使用该事务连接。WebSocket 的 `audio` 和后台试听响应可选携带 `captions`，路径和音频接口不变。Azure 缓存签名升级为 `azure-sdk:audio-24khz-48kbitrate-mono-mp3:captions-v1`，旧文件保留，新合成不命中缺少元数据的旧版缓存。当前 13 个音色及浏览器验证见[Azure 字幕实测](operations/azure-captions-20261114.md)。

`WS /api/toc/ws/matches/:id`，消息类型定义在 `@battle/shared`（`ClientMessage` / `ServerMessage`）：

1. 客户端连接后发送 `{ type: 'hello', afterSeq }`（10 秒内未发送则从头开始）。
2. 服务端逐个推送 `{ type: 'event', event, audio }`，客户端播放完毕发送 `{ type: 'ack', seq }` 后才推送下一个；推送时预先为之后的 3 个事件准备语音。
3. 暂时没有新事件时推送 `status`（状态没变不重复发）；对局结束且事件推完后推送 `{ type: 'end', result }` 并关闭；失败推送 `status: failed`。推送进行中收到的总线通知会记为"待重查"，本轮结束后再查一次，不会丢掉唤醒。
4. 等待"尚未产生的事件"期间，每 `STREAM_POLL_MS`（默认 2000 毫秒）兜底重查一次数据库：另一实例的 worker 提交的事件正常情况下经总线即时送达，兜底重查只是通知丢失（监听连接重连期间）时的安全网；等待观众 ack 期间不查（推送由 ack 驱动），连接关闭时清掉定时器。某一步推送抛错（如数据库短暂不可用）时记日志，没在等 ack 就按同样间隔重试，不依赖可能同时断开的总线通知。
5. 断线重连用最后确认的 seq 作为 `afterSeq` 续播；已结束的对局从 0 开始即为回放，与实时走同一条路径。`afterSeq > 0` 同时视为对该进度的一次确认：第一次查到对局后补记 `markAcked(afterSeq)`（断线前最后一次 ack 可能没送到，后台"观众确认"不会少一个），对公开接口不可见的对局不补记。
6. 观众的 `ack`、跳过的不可见事件与重连的 `afterSeq` 都先记为待补记，在下一步推送开头写库；写库失败只记日志、不影响续播，进度留到下一步再补。语音准备读取音色失败时同样记日志并返回 `audio: null`（交给前端朗读），失败结果不缓存。
7. 多个观众时，`matches.acked_seq` 取最大确认值；确认进度只增不减，且不超过 `last_seq`（客户端报的 `afterSeq` 不能把 ack 节奏的闸门抬到事件之前）。
8. 客户端帧上限 16 KB（`MAX_CLIENT_FRAME_BYTES`，按 UTF-8 字节计）：`app.ts` 把它设成 ws 服务器的 `maxPayload`（`createNodeWebSocket` 不透传选项，但 ws 在升级连接时才读取 `wss.options`），超过的帧在协议层就以 1009（message too big）关闭、不会先缓冲整帧；网关在解析前再按字节数检查一次，命中时以 1008 关闭，作为第二道防线。

### 多实例

同一个 PostgreSQL 上可以跑多个服务实例，不需要 Redis 或其他组件；所有跨实例协调都在数据库里：

- **事件总线**（`utils/pgEventBus.ts` + `db/notifier.ts`）：`EventBus` 接口不变，`emit` 先投递给本进程的监听者（播放流、worker），再 `pg_notify` 到通道 `battle_<DATABASE_SCHEMA>`，载荷是 `{ instance, event, payload }` 的 JSON（远小于 NOTIFY 的 8000 字节上限，超过则不发只记日志）。通道名带 schema：NOTIFY 是整个数据库范围的，同一个库里不同 schema 的部署（以及并行跑的测试）互不串扰。每个实例启动时生成随机 `instanceId`（健康检查返回它），收到自己发的通知按 ID 丢掉，本地监听者不会收到两次；其他实例的通知解析校验（zod）后投递给本地监听者。四种事件都跨实例：`match:events` 唤醒观众的播放流、`tasks:queued` 与 `match:acked` 唤醒 worker（ack 节奏的对局靠观众确认推进）、`match:status` 通知观众状态变化。
- **监听连接**：LISTEN 不能走连接池（连接被回收就收不到），每个实例用一条专用 `pg.Client`，`index.ts` 在 worker 与 HTTP 之前 `bus.start()`，关闭时在 worker 停止后 `bus.stop()`。连接断开时记日志并按退避重连（0.5 秒起翻倍，封顶 10 秒）；重连期间本地投递照常，丢失的通知由兜底轮询（播放流 `STREAM_POLL_MS`、worker 每秒）补上，所以轮询仍然保留。首次连接失败也不阻止启动，同样转入重连。NOTIFY 走连接池，发送失败只记日志。
- **限流与锁定计数**（`request_windows` 表，`modules/limits`）：`WindowStore` 接口 `{ count, add, clear, prune }`，生产用数据库实现（`createDbWindowStore`），内存实现只供单元测试。开局限流（每来源每小时 10 局）与登录锁定（来源 + 用户名 15 分钟 10 次、来源累计 30 次）都写这张表，key 由用途与来源拼成（`windowKey`，各段 URL 编码，不会串）。清理不用定时任务：每 64 次 `add` 把早于最长窗口（1 小时）的记录与本次插入放在同一条语句里（data-modifying CTE）删掉，表的大小由保留期内的请求数决定。计数与记录不是同一条语句，并发请求可能略微越过上限——限流只求近似。
- **TTS 合成**：进程内按音频 ID 的 inflight 表是快路径；跨实例由 `media` 仓储的 `locked(id, work)` 在事务里持 `pg_advisory_xact_lock(2, hashtext(id))`，后到的实例等锁后再查一次就命中缓存，不重复付费。合成期间占用一个连接池连接（最长 `TTS_TIMEOUT_MS`），所以每个实例同时最多 3 个持锁合成（`tts/constants.ts` 的 `MAX_CONCURRENT_SYNTHESES`，`utils/semaphore.ts`），先拿名额再开事务，排队的请求不占连接；连接池取连接最多等 15 秒（`connectionTimeoutMillis`），用满时报错而不是无限挂起。
- **回收器**：每次清扫 `pg_try_advisory_xact_lock(1, 1)`，拿不到就跳过，下个周期再试。
- **初始管理员**：`bootstrap` 先快速查表，为空时在持 `pg_advisory_xact_lock(1, 2)` 的事务里再查一次才插入，多实例同时启动只创建一个。
- **本来就安全的部分**：AI 任务领取 `FOR UPDATE SKIP LOCKED`；公开开局上限在事务里持 advisory lock（单键 7201）串行化。所有 advisory lock 键登记在 `db/locks.ts`。

运维要点：每个实例比连接池多占一条数据库连接（LISTEN）；连接池监听 `error` 事件，数据库重启或切换时空闲连接报错只记日志，进程不会退出，连接池自行补建连接；NOTIFY 是 PostgreSQL 内置功能，不需要扩展；advisory lock 与 NOTIFY 都是数据库范围而非 schema 范围，共用一个库、不同 schema 的部署会互相等待锁（只影响效率，不影响正确性），通道名已按 schema 区分。测试里 `createTestApp` 可传 `{ schema }` 复用另一个实例的 schema，用来搭两个实例（`test/multiInstance.test.ts`）。

### 部署与游戏版本

对局快照固化了创建时游戏定义的 `specHash`，它覆盖规则函数源码与模板（见 `project-engine.md`）。部署了改动规则或模板的新代码后，进行中的旧对局无法再推进：下一次推进（worker 交回 AI 结果、后台调试指令）会把它标为 failed，不会停在 `waiting_ai` / `paused` 上；暂停中的调试局要等下一条调试指令才会被终止。已经领取的任务仍会先调用一次模型，结果随后作废。

因此改动规则的版本不能与旧版本混跑（滚动部署）：新旧实例会把对方创建的对局都判为版本不匹配而终止。这类版本应停掉全部旧实例后再启动新实例；只改服务端、前端等不影响 `specHash` 的版本可以滚动部署。

## 数据库

### 跨局玩家记忆

迁移 `023_memory_review_calls` 记录后台记忆 worker 调用模型的每一次尝试。发起前写入对局、席位、任务领取次数和主备模型；收到回复后记录耗时和供应商返回的 token 数。调用失败、回复无效和保存失败分别记录，记忆与最终成功状态在同一事务提交。租约被接替时标记本次领取已失效。进程中断可能只留下开始或收到回复的记录。无可复盘证据直接完成任务。旧任务的调用明细无法追溯。

管理员通过 `GET /api/admin/player-memory/players/:id/calls?offset=0&limit=10` 查看按尝试编号倒序排列的记录。这里按 worker 对主模型或备用模型的调用计数，用量缺失返回 null。

迁移 `020_player_memory` 新建四张表。`player_decisions` 按对局和请求保存玩家的实际行动、简短判断与其引用的可见事件。`player_memory_reviews` 是按对局和玩家去重的持久复盘队列。`player_memories` 保存每次复盘形成的经验、来源事件摘录、关联决策及被修订版本的编号。`player_memory_uses` 关联写入请求提示词的记忆，索引后续行动。查询时只有被引擎采纳的回复所声明的有效编号算明确引用。

正常创建的模型局按稳定玩家 ID 固定本局记忆。每人最多取同玩法二十四条候选经验，包含通用经验与涉及本桌玩家的观察，已被新版修订的条目可在后台回查。正式局结束时在提交事务内为在册玩家排队，独立 worker 每次处理一席，允许多个实例并行领取。复盘使用该席模型，主模型不可用时可尝试备用模型。每席每局可产生零到两条有证据的经验。复盘只使用公开事实、本人当时记录的判断和已校验的可见依据。用模型评估的“支持 / 反证”必须关联本人判断，并引用决策后可核对的结果事件。未达到此条件的结论保留为未验证。

任务采用三分钟租约和领取次数校验，结果与任务完结在同一事务提交。可重试的网络故障沿用主备模型和任务退避，任务最多领取三轮。结构或引用错误会把具体字段路径和约束写入调用记录，并传入下次请求。输出预算耗尽会缩短材料、减少所需输出，并将初始 1600 tokens 的预算最多翻倍两次，始终受模型上限约束。这些调整在切换备用模型、重新领取任务后都有效。明确的永久调用错误跳过该模型。导入局、调试局和启用功能前创建的对局不自动补写。删除整局会级联删除该局决策、来源记忆、复盘任务和关联索引。单独删除 Trace 后，玩家记忆及其简短依据仍可按记忆接口读取，模型调用明细仍按 Trace 原有契约删除。

管理员查询接口 `GET /api/admin/player-memory/players/:id` 支持 `offset`、`limit`、`gameKey` 和 `subjectId`。返回分页记忆、证据、后续提示词及引用状态、待复盘和失败计数，响应禁止缓存。调用链节点详情在有记忆的请求上返回 `memory.offered` 和 `memory.decision`；排队、拒绝、失败或兜底时后者为空。

管理员调用 `DELETE /api/admin/player-memory/players/:id/memories/:memoryId` 忘记一条，或 `DELETE /api/admin/player-memory/players/:id` 清空该玩家的所有记忆。迁移 024 添加遗忘标记及玩家的清空批次。遗忘擦除记忆正文、证据与关联对象，保留编号和版本关系用于识别失效修订。删除对局时，这局产生且修正了其他对局记忆的记忆以同样方式转为遗忘墓碑并解除对局关联（迁移 025：`match_id` 可空，约束只有已遗忘的记忆可以没有来源对局），被修正的旧记忆继续隐藏；其余记忆随对局级联删除。历史对局快照、决策与复盘调用明细继续反映当时的实际执行。清空会同时取消该玩家排队或执行中的复盘；迟到回复无法再写入。新开局和终局入队均按玩家行锁同步清空批次，兼容迁移前开局的快照（批次 0）。

管理端 `GET /api/admin/traces` 可按游戏 / 状态分页列出对局；`GET /api/admin/traces/:id` 返回当前玩法注册的角色展示名、节点索引、每次模型尝试的摘要和分模型用量；`GET /api/admin/traces/:id/nodes/:node` 按需读取关联决策、提示词、模型参数 / 输出及对应舞台快照。三个接口及删除共用管理员鉴权。节点随对局推进在同一事务写入 `match_trace_nodes`，以对局内的阶段访问、请求 ID 和事件 seq 建立关联。脚本局采集决策和规则节点，模型传输次数为零。

`DELETE /api/admin/traces/:id` 锁定对局行，设置 `matches.trace_deleted`，删除本局节点、`ai_calls` 和已完结任务缓存的请求 / 输出 / 错误，并清空 `player_decisions` 中来自模型的判断理由（`note.judgement`；与日志一致的选择保留供记忆复盘），同一事务提交。删除后继续推进时新的决策不再保存判断理由。进行中的任务仅在执行期间保留必要输入，完成或取消后清空。模型传输在事务外执行，写入明细前在共享行锁内复核删除标记。重复删除幂等；之后新推进不会重新采集。对局状态、游戏日志、舞台事件、回放与音频继续保留。私密调用链接口及模型调用明细响应使用 `private, no-store`。

PostgreSQL 16，连接时通过 `search_path` 指定 `DATABASE_SCHEMA`（默认 public）。启动时自动执行迁移，失败则拒绝启动。

| 表 | 说明 |
| --- | --- |
| `admin_users` | 管理员：用户名、密码哈希、是否需改密、令牌代次 `token_generation`（迁移 027） |
| `access_codes` | 身份码：用户名、码哈希与末 4 位、`generation`、有效期、局数上限与已用局数、停用标记、最近开局时间、创建人（迁移 026）；`matches.access_code_id` 引用它，删除时置空 |
| `model_providers` | 供应商（加密的 API Key + 掩码） |
| `models` | 模型参数、备用模型（自引用，删除时置空）、系统停用原因与时间（`disabled_reason` / `disabled_at`，迁移 003） |
| `voices` | 音色：来源、音色名、语言、性别、风格、语速、音调、试听文本、说明（迁移 003） |
| `players` | AI 玩家。迁移 011 允许模型为空。删除模型前可显式解绑引用它的玩家；音色删除时置空。真实模型局要求每席已绑定模型，脚本调试可使用未绑定的玩家。 |
| `matches` | 对局：游戏、变体、spec 版本与 hash、种子、状态、debug / scripted / pacing、`chaos`（脚本化调试局是否用混沌脚本，迁移 005）、引擎快照、当前阶段 `phase_id`（快照游标的冗余列，随快照一起写入，迁移 007）、版本号、`last_seq` / `acked_seq`、结果 |
| `match_seats` | 座位 → 玩家、模型、音色（开局时固化，玩家删除后保留名字） |
| `ai_tasks` | AI 请求队列（queued / running / succeeded / failed / cancelled，领取过期时间，领取次数 `attempts`，迁移 004） |
| `match_stage_events` | 按 seq 的舞台事件，实时推送与回放共用 |
| `ai_calls` | 每次模型调用的分层 prompt、原始响应、解析结果、错误、耗时与用量 |
| `media_assets` | 合成音频缓存及可选的 `captions` JSONB 时间轴（迁移 021） |
| `request_windows` | 开局限流、登录锁定与身份码输错计数的滑动窗口记录（`key`、`at`，索引 `(key, at)`；迁移 006），写入时顺带清理过期行 |

## 配置

见 `.env.example`：`PORT`（默认 3100）、`DATABASE_URL`、`DATABASE_SCHEMA`、`DATABASE_POOL_MAX`、`JWT_SECRET`（≥32 字符）、`SECRET_KEY`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`（≥12 字符）、`AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION`、`MIMO_API_KEY` / `MIMO_BASE_URL` / `MIMO_TTS_MODEL`、`AI_CONCURRENCY`（默认 4）、`AI_TASK_MAX_ATTEMPTS`（默认 3，一个 AI 任务最多领取几次）、`MAX_ACTIVE_MATCHES`（默认 5）、`MATCH_IDLE_MINUTES`（默认 30）、`STREAM_POLL_MS`（默认 2000，播放流等待新事件时的兜底重查间隔；跨实例事件经 LISTEN/NOTIFY 即时送达，这只是监听连接重连期间丢失通知时的安全网）、`SHUTDOWN_TIMEOUT_MS`（默认 10000，优雅关闭时最多等待进行中 AI 任务的毫秒数）、`TRUST_PROXY`（默认 false）；`NODE_ENV`（默认 `production`，本机开发在 `.env` 里设为 `development`）为 `production` 时调试局对公开接口不可见，只有 `development` 挂出本地调试开局接口。`pnpm --filter @battle/server dev` 读取根目录 `.env`。

## 测试

`packages/server/test/`：集成测试连接真实 PostgreSQL（`TEST_DATABASE_URL`，默认本机开发库 `127.0.0.1:5433`），每个测试文件创建独立 schema 并在结束时删除，文件之间串行执行；HTTP 用 `app.request()`，WebSocket 测试用 `support/stream.ts` 在随机端口监听并逐个确认事件。模型、语音与跨实例通知传输层通过 `createServices` 的 `ExternalDeps` 注入假实现（默认用真实的 LISTEN/NOTIFY，每个测试实例一条监听连接）。CI 中由 PostgreSQL service 提供数据库。

对局仓储的普通读取（`find`、`list`，供概要、详情、列表、播放流、worker 判断是否脚本化）只取元数据列，不含快照：快照带全部日志，随对局变长，回放时每推送一个事件都会读一次对局行。只有推进（`lock`，`SELECT … FOR UPDATE`）、脚本化输出（`snapshot`）与后台完整日志（`log`，只取 `snapshot -> 'log'`）才读快照。

Kysely 的 `CamelCasePlugin` 必须开启 `maintainNestedObjectKeys`：快照等 jsonb 中以阶段 ID 为键的对象（如 `visits.guard_protect`）不能被改名。

## 与引擎的关系

服务端只通过 `@battle/engine` 公开 API 驱动对局：保存 `advance` 返回的快照，推送 `stageEvents`，把 `aiRequests` 交给 AI worker，再把模型输出以 `ai_result` / `ai_failed` 交回。规则、合法性与胜负全部在引擎内完成，服务端不做任何游戏判断。
