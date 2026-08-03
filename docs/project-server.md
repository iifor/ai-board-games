# 后端服务架构

## 项目概述

后端位于 `packages/server`，负责 Express REST API、WebSocket 游戏会话、工作流推进、数据库访问、模型/音色/玩家配置、AI 与 TTS 调用、静态资源托管和统一错误处理。

## 技术栈

- TypeScript
- Express
- ws
- better-sqlite3
- zod
- Microsoft Cognitive Services Speech SDK
- OpenTelemetry

## 稳定目录边界

本节只记录后端长期稳定的职责边界，帮助判断改动应落在哪一层；具体文件位置、符号定义、调用方和影响面使用 CodeGraph 查询。

```txt
packages/server/
├── index.ts                 # HTTP server 入口，挂载 WebSocket 并监听端口
├── app.ts                   # Express app 创建、路由挂载、静态资源、seed
├── aiDebateRunner.ts        # 辩论赛 runner 入口
├── dev-runtime.cjs          # 开发/启动运行脚本
├── config/
│   ├── env.ts               # .env 加载
│   ├── ai.ts                # 运行时 AI 配置聚合
│   └── index.ts
├── db/
│   ├── index.ts             # 数据库初始化入口
│   ├── migrations.ts        # SQLite 表结构和字段补齐
│   ├── fallback.ts          # JSON fallback 数据库
│   ├── migrate-fallback.ts
│   └── seed.ts              # 默认数据
├── middlewares/
│   ├── responseFormatter.ts # 统一响应格式
│   ├── errorHandler.ts      # 统一错误处理
│   └── validate.ts          # zod 参数校验中间件
├── routes/
│   └── gameRoutes.ts        # C 端游戏 REST 路由
├── modules/
│   ├── upload/
│   ├── skins/
│   ├── players/
│   ├── model-providers/
│   ├── models/
│   ├── voices/
│   ├── werewolf-config/
│   ├── games/
│   ├── settings/
│   ├── observability/
│   ├── workflow-engine/
│   ├── game-socket/
│   ├── debate/
│   ├── werewolf/
│   ├── agent-core/
│   ├── llm/
│   ├── tts/
│   ├── game-memory/
│   ├── game-engine/
│   └── skin-engine/
├── resources/
│   └── uploads/
├── services/
│   ├── ai/
│   ├── debate/
│   └── text/
├── types/
└── utils/
```

## 架构设计

后端入口分为两层：

- `index.ts` 创建 HTTP server，调用 `createApp()`，通过 `attachGameSocket(server)` 挂载 WebSocket，并监听端口。
- `app.ts` 创建 Express app，注册辩论工作流，初始化种子数据，挂载中间件、管理后台 API、C 端 API、静态资源和 SPA fallback。

API 分为两类：

- `/api/toc/*`：C 端游戏前台使用。
- `/api/admin/*`：B 端管理后台使用。

WebSocket：

- `/api/toc/ws/game`
- 入站消息使用按 `type` 区分的 Zod schema 校验；单条消息最大 64 KiB，无效消息返回 `INVALID_MESSAGE`。

统一响应结构来自 `responseFormatter` 和共享类型：

```ts
{
  code: number | string;
  message: string;
  data?: unknown;
}
```

## API 路由总览

| 路径 | 使用方 | 职责 |
| --- | --- | --- |
| `/api/toc/*` | C 端游戏前台 | 健康检查、玩家选择、狼人杀模式、历史对局、游戏详情等 C 端数据 |
| `/api/admin/*` | B 端管理后台 | 玩家、模型供应商、模型、音色、狼人杀配置、皮肤、历史、观测、工作流调试等管理资源 |
| `/api/toc/ws/game` | C 端游戏前台 | 实时游戏、播放 ack、暂停/继续/跳过、历史回放 |

具体 WebSocket 协议见 `docs/project-workflow.md`。

## 核心模块

### 播放事件持久化

`game_playback_events` 保存狼人杀实际发送到 C 端的最终展示事件。记录按
`game_id + sequence` 排序，包含协议版本、原始视角、事件载荷和媒体引用；
删除 `games` 记录时同步清理。游戏快照和播放事件必须在同一事务中写入。

终局持久化由 `game-socket/service.ts` 在 workflow 已完成后触发。服务端先冻结在线
播放已准备的事件前缀，再离线补齐未发送事件和 `workflow-completed`，随后调用
`saveGameRecord`。该事务同时写入游戏快照、玩家快照、精确回放事件和跨局长期记忆；
事务提交后才发送完成事件，因此 C 端在终局播放期间断线不会丢失正式对局。
同一游戏 ID 使用替换式保存，长期记忆使用 `lastGameId` 防重，断线恢复或重复完成
不会产生重复历史记录和重复记忆累计。保存异常向 socket 返回错误，不发送完成事件。

### Express 与中间件

- `createApp()`：创建应用、挂载路由、托管静态资源。
- `responseFormatter`：给响应对象挂载统一成功响应能力。
- `errorHandler`：统一处理异常，避免泄漏数据库错误、服务器路径、密钥等敏感信息。
- `validate`：基于 schema 校验请求参数。

### 管理后台资源模块

后台资源统一挂载到 `/api/admin`，常见模块包括：

- `players`：AI 玩家资料、模型、音色、人格、排序、启用状态。
- `model-providers`：模型供应商、baseUrl、apiFormat、加密 key。
- `models`：具体模型配置。
- `voices`：语音包。
- `werewolf-config`：狼人杀角色和模式。
- `games`：对局历史和详情。
- `skins` / `skin-engine`：皮肤资源和解析。
- `settings`：应用设置。
- `observability`：trace、span、LLM、agent 决策观测。
- `workflow-engine`：工作流调试 API。
- `player-memory`：跨局玩家画像、本局 AI 会话快照、记忆统计与清除。

谁是卧底调试对局通过已鉴权的
`POST /api/admin/workflow/matches/:matchId/debug-control` 接受
`{ interruptId, action }`，其中 action 为 `continue`、`skip`、`continuous`
之一。`interruptId` 必须来自 debug state 中调用方实际看到的当前 pending
Undercover 调试断点；服务端在事务内校验其 match、step、类型和状态，因此旧 ID、
重复动作、普通对局、其他游戏、缺失对局与非当前断点均拒绝。
该能力复用现有 `workflow_interrupts` 与 `matches.config_json`，不新增数据库表。

大多数资源模块遵循：

```txt
modules/<moduleName>/
  controller.ts    # 请求和响应
  service.ts       # 业务逻辑
  repository.ts    # 数据库访问
  routes.ts        # 路由绑定
  validator.ts     # 参数校验
  types.ts         # 模块类型
  constants.ts     # 模块常量
  utils.ts         # 模块工具
  index.ts         # 对外导出
```

### C 端 API

C 端 REST 路由挂载到 `/api/toc`，主要能力包括：

- 健康检查和 AI 配置状态。
- AI 玩家列表。
- 玩家选择读取与保存。
- 狼人杀模式读取。
- 历史对局列表和详情。

### 通用游戏引擎模块

`modules/game-engine` 是通用 AI 玩家游戏引擎 core 骨架，当前只作为后端内部模块使用，不新增 HTTP API。

- `engine`：`GameEngine`、`GameDefinitionRegistry`、`InvariantChecker`。
- `workflow`：包装现有 `workflow-engine` 创建和 tick 能力。
- `action-window`：ActionWindow 生命周期和 action 提交合法性校验。
- `effect`：`EffectQueue` 和 `EffectResolutionService`，负责 `Action -> Effect -> Event -> State` 链路。
- `channel`：统一校验 DomainEvent 可见性通道。
- `state`：`MatchStateStore` 接口和 SQLite adapter，隔离 core 与数据库实现。
- C 端公开游戏类型和玩家数量校验统一读取已注册 `GameDefinition.session.playerSelection`，路由不再维护重复白名单。

当前阶段复用既有工作流表，不新增数据库表。`SqliteMatchStateStore` 通过现有 `matches.state_json` 保存投影后的 match state，通过 `workflow_effects` 和 `workflow_events` 保存 effect/event。

狼人杀 `werewolf.action_window` 已通过 werewolf 专用 bridge 接入 Engine Core 的 action/effect/resolver/projector contract。当前接管范围限于夜间行动状态写入，不接管夜间死亡结算、Socket 播放轴或 TTS。bridge 会写入 `werewolf_action_engine_shadow_audited` system workflow event，用于持续对比 legacy reducer 与 Engine Core 投影结果。

### 数据库层

数据库默认使用 SQLite，文件在 `data/consensus-mist.sqlite`。核心入口：

- `db/index.ts`：初始化数据库连接。
- `db/migrations.ts`：创建表和字段补齐。
- `db/fallback.ts`：JSON fallback 数据库。
- `db/seed.ts`：默认玩家、模型、音色、狼人杀配置等数据。

主要数据表类别：

- 配置类：`players`、`model_providers`、`models`、`voice_packages`、`werewolf_roles`、`werewolf_modes`、`skins`、`app_settings`
- 对局类：`games`、`game_players`、`game_player_selections`
- 工作流类：`matches`、`match_snapshots`、`workflow_events`、`ai_tasks`、`pending_actions`、`outbox_messages`、`workflow_effects`、`workflow_interrupts`
- 观测类：`game_traces`、`trace_spans`、`llm_records`、`agent_decisions`、`game_events`、`state_snapshots`
- 记忆类：`memory_snapshots` 保存按 match 隔离的本局会话；`player_game_memories` 保存按游戏类型、观察者和被观察者聚合的跨局画像。

`player_game_memories` 使用 `(game_type, owner_player_id, subject_player_id)` 唯一键，玩家标识使用稳定的 `sourcePlayerId`。比赛记录与长期画像在同一保存事务内更新，避免对局已落库但画像更新失败时返回假成功。

Workflow 快照使用 `match_snapshots.last_event_seq` 记录事件水位，恢复时只读取水位
之后的事件。事件状态变化保存轻量路径 patch，`matches.state_json` 继续作为最新运行
状态和恢复校验来源。快照按 match 保留最近 3 个；调试终态 match 自动保留最近
20 局并依赖外键级联清理关联 workflow 数据。

`running` / `waiting` match 若连续超过 7 天未更新，服务会在启动时及此后每 24 小时
执行硬删除，并依赖外键级联清理关联 workflow 数据。该清理释放的 SQLite 页面可被
后续写入复用；在线服务不执行阻塞式 `VACUUM`，物理缩小数据库文件需在停服维护窗口完成。

调试 workflow 的持久化耗时直接输出结构化服务端日志，不写入 observability 或
workflow 表，避免性能测量再次产生数据库写入放大。超过 500ms 的记录使用 warning。

记忆管理 API：

- `GET /api/admin/player-memories/stats`
- `POST /api/admin/player-memories/clear`，请求体 `gameType` 仅允许 `werewolf`、`debate`、`all`

清除操作只删除跨局长期画像，不删除进行中的 `memory_snapshots`、历史比赛、Trace 或玩家基础人格。

`game_traces.participants_json` 保存本局座位与玩家资源映射，元素包含
`seatId/sourcePlayerId/nickname`。Trace 详情 API 返回解析后的 `participants`；
历史记录可通过 root span 的 `game.id` 从 `matches.state_json` 兼容恢复。

LLM HTTP 调用对超时、连接失败、HTTP `429` 和 `5xx` 最多自动重试一次，使用短
退避。每次尝试分别记录 LLM span/record；鉴权、参数等确定性 `4xx` 不重试，
JSON 和目标校验仍由 Agent 层处理。

## 配置与部署

单实例并发由 `MAX_CONCURRENT_GAMES`（默认 5）、`MAX_CONCURRENT_LLM_REQUESTS`（默认 8）和 `MAX_CONCURRENT_TTS_REQUESTS`（默认 4）限制。重复 WebSocket `start` 会被拒绝；游戏容量超限返回“服务器繁忙，请稍后重试”。这些限制仅作用于当前 Node.js 进程，不提供多实例协调。

启动与构建：

```bash
pnpm run dev:server
pnpm run build:server
pnpm run start
pnpm run check:server
```

环境变量：

- `.env.example` 提供语音、TTS、Cloudflare、数据库模型密钥和生产认证示例。
- `config/env.ts` 会从根目录或 server 上级目录加载 `.env`。
- 模型运行时 key 主要通过数据库模型配置或 `DATABASE_MODEL_API_KEY` 兜底。
- 生产环境必须配置至少 32 字符的 `JWT_SECRET`、非空 `ADMIN_USERNAME` 和至少 12 字符的 `ADMIN_PASSWORD`；缺失或强度不足时服务在监听端口前失败。
- 环境变量只在 `admin_users` 为空时创建首个管理员，并标记为必须修改密码；已有任意管理员时启动过程不创建、禁用、更新或覆盖账号。未配置时开发环境不会自动创建管理员，代码中不保留默认账号或密码。
- 首次登录的管理员只能调用改密和当前身份接口；其余管理 API 返回 `PASSWORD_CHANGE_REQUIRED`。`POST /api/admin/auth/change-password` 接收客户端 MD5 摘要，服务端以 scrypt 保存，并在成功后清除改密标记、返回新 JWT。
- 管理员登录按“客户端 IP + 用户名”限流：15 分钟内最多允许 5 次失败，第 6 次请求返回 HTTP 429；登录成功会清除该组合的失败计数。计数仅保存在当前 Node.js 进程内存中，重启后会重置；当前单实例 Compose 部署符合这一边界。

静态资源：

- `/resources` 指向上传资源根目录。
- `/admin` 托管后台构建产物。
- 根路径托管 C 端构建产物。
- 服务端端口和根命令以 `docs/project-summary.md` 为准。

生产容器：

- 最终 runtime 镜像包含 TypeScript 运行器及 `packages/shared/dist`，CI 必须构建最终镜像而不是只构建 builder stage。
- `consensus-data` volume 挂载到 `/app/data`，保存 SQLite 数据库。
- `consensus-resources` volume 挂载到 `/app/packages/server/resources`，保存上传图片和生成语音。
- 收到 `SIGTERM` 或 `SIGINT` 后依次关闭 WebSocket、OpenTelemetry、数据库和 HTTP server；10 秒内无法关闭或清理失败时以非零状态退出。

腾讯云入口：

- HTTPS、域名证书、WAF 和公网健康检查由腾讯云负载均衡负责。
- 腾讯云 WAF 必须为 `POST /api/admin/auth/login` 配置按 IP 的频率规则。WAF 覆盖进程重启和分布式来源；应用层限流则通过 IP + 用户名保护单个账号。
- 负载均衡通过 HTTP/WebSocket 回源 Nginx 80 端口；Nginx 保留 `X-Forwarded-Proto`，Express 信任一个代理 hop。
- CVM 安全组的 80 端口只允许负载均衡访问，Node.js 的 3001 端口只绑定到本机。

部署验证（在 CVM 项目目录执行）：

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl -fsS "https://${PRODUCTION_DOMAIN}/api/toc/health"
```

部署前备份数据库与生成资源（生产 `.env` 使用 `COMPOSE_PROJECT_NAME=consensus`）：

```bash
mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"
docker compose stop app
docker run --rm -v consensus_consensus-data:/source:ro -v "$PWD/backups:/backup" alpine sh -c "tar czf /backup/data-${STAMP}.tgz -C /source ."
docker run --rm -v consensus_consensus-resources:/source:ro -v "$PWD/backups:/backup" alpine sh -c "tar czf /backup/resources-${STAMP}.tgz -C /source ."
docker compose start app
```

恢复前确认两个文件的时间戳一致，然后执行：

```bash
DATA_BACKUP="data-20260715-120000.tgz"
RESOURCES_BACKUP="resources-20260715-120000.tgz"
docker compose stop app
docker run --rm -e ARCHIVE="$DATA_BACKUP" -v consensus_consensus-data:/target -v "$PWD/backups:/backup:ro" alpine sh -c 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar xzf "/backup/$ARCHIVE" -C /target'
docker run --rm -e ARCHIVE="$RESOURCES_BACKUP" -v consensus_consensus-resources:/target -v "$PWD/backups:/backup:ro" alpine sh -c 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar xzf "/backup/$ARCHIVE" -C /target'
docker compose start app
docker compose ps
```

将示例文件名替换为实际备份。SQLite 与资源必须使用同一时间点的成对备份；volume 持久化不能替代异机备份。

## 扩展点与注意事项

- 新增后端 API 时优先放入 `modules/<moduleName>`，不要堆到 `app.ts` 或 `index.ts`。
- controller 不写复杂业务逻辑，repository 不写业务规则。
- 所有用户输入必须通过 validator/schema 校验。
- 敏感信息不得写入代码或返回前端。
- API 错误必须交给统一错误处理，不允许静默 catch。
- 修改 API、数据库表、配置或模块边界时，同步更新 `docs/project-server.md` 和相关文档。
## Werewolf 12-player expansion

- Default werewolf seed data now includes role `white_wolf_king` and mode `white-wolf-king-guard-12`.
- `guard-12` remains the mode id for `预女猎守（12人）`; only the default name and description are normalized to the 4 wolf, 4 villager, seer, witch, hunter and guard lineup.
- Startup seed upserts default werewolf roles and modes even when the database already contains data, so existing local databases can receive new default roles/modes without a new table.
- White wolf king self-destruct target validation and death application live under `packages/server/modules/werewolf`. The frontend/admin only consume resulting events and snapshots.
- No database table was added for this expansion. The change extends existing role, mode, workflow event and playback payload structures.

## Werewolf first-batch boards

- Default seed and werewolf-config constants are aligned for first-batch boards: `standard-12`、`standard-hybrid-12`、`elder-knight-12`.
- Default roles now include `hybrid`、`silence_elder`、`knight`; default executable actions include `chooseMaster`、`silence`、`duel`.
- Rule execution remains inside `packages/server/modules/werewolf`: workflow steps schedule the action windows, reducers validate/apply results, prompts/actions provide AI contracts, and death resolution handles any resulting deaths.
- No database table, migration, REST route or WebSocket connection protocol was added. Existing seed upsert brings new default roles and modes into local databases.

## Werewolf second-batch boards

- Default seed and werewolf-config constants now include `elder-stalker-12` and `butterfly-stalker-12`.
- Default roles now include `stalker` and `butterfly`; executable actions include `stalk` and `hug`.
- Server reducers enforce stalker eligibility from the previous day vote and butterfly skill blocking. Night deaths still flow through existing `night_resolve` and death resolution.
- No database table, migration, REST route or WebSocket connection protocol was added.

## Werewolf third-batch boards

- Default seed and werewolf-config constants now include `wolf-beauty-guard-12`, `demon-guard-12` and `nightmare-guard-12`.
- Default roles now include `wolf_beauty`, `demon` and `nightmare`; executable actions include `charm`, `inspectRoleType` and `fear`.
- Server reducers/effects enforce wolf beauty charm linked death, demon god-role inspection and poison immunity, and nightmare skill blocking with non-repeat target validation. Deaths continue to flow through existing `night_resolve`, death resolution and win check paths.
- No database table, migration, REST route or WebSocket connection protocol was added.

## Werewolf fourth-batch boards

- Root `TODO.md` records the remaining board status from `狼人杀玩法.md`; mode 29 is now implemented from the confirmed shared-hunt rules.
- Default werewolf config includes mode 28 `firepower-12`, mode 29 `wolf-escape-10`, and the passive villager role `sapling`.
- Default seed and werewolf-config constants now include `evil-knight-guard-12` and `wolf-beauty-rogue-12`.
- Default roles now include `evil_knight` and `old_rogue`.
- `evil_knight` is a wolf-side role and participates in the existing wolf kill action. It does not receive a self-destruct action. Its first night reflection from witch poison or seer check is resolved in `werewolf/effects.ts`; the same night can trigger it only once.
- `old_rogue` is counted as villager-side. Witch poison and hunter shot set `oldRoguePendingDeath`; the player dies after next-day `day_speech` resolves.
- Wolf beauty on `wolf-beauty-rogue-12` does not charm-kill when poisoned, and `old_rogue` is not killed by wolf beauty charm.

## Werewolf sixth-batch boards

- Default seed and werewolf-config constants now include `big-bad-wolf-fortune-teller-12`, `hidden-wolf-crow-12` and `bear-tamer-hidden-wolf-12`.
- Default roles now include `big_bad_wolf`, `fortune_teller`, `hidden_wolf`, `crow` and `bear_tamer`; executable actions include `soloKill`, `mark`, `curse` and `bearRoar`.
- Server reducers/effects enforce big bad wolf extra kill, fortune teller once-per-game mark, crow non-repeat curse and exile vote bonus, hidden wolf good-side seer result, bear tamer adjacent wolf roar and hidden wolf weak-link death in the bear tamer board.
- Debug mode uses the same action windows and reducers as real mode, with random legal payloads and skill trigger probability instead of bypassing these roles.
- No database table, migration, REST route or WebSocket connection protocol was added.
- No database table, migration, REST route or WebSocket start/control/ack shape was added.

## Werewolf seventh-batch boards

- Default seed and werewolf-config constants now include `wild-child-12`, `bombman-12` and `nine-tailed-fox-12`.
- Default roles now include `wild_child`, `bombman` and `nine_tailed_fox`; executable actions include `chooseMaster`, `blastVoters` and `loseTailOnGoodDeath`.
- Wild child reuses the existing first-night `chooseMaster` action window and stores `wildChildModelId`; when the model dies, the server changes the living wild child to wolf faction and grants the existing wolf kill action.
- Bombman uses the existing exile resolver. When exiled, the server blasts living voters who voted for the bombman, marks their death reason as `bombman_blast`, and disables death-shot skills for that death reason.
- Nine-tailed fox starts with 9 tails. Good god deaths remove 2 tails, good villager deaths remove 1 tail, and tail count reaching 0 kills the fox with `nine_tailed_fox_tails`.
- No database table, migration, REST route or WebSocket start/control/ack shape was added. Bombman third-party solo win remains deferred until the project has explicit third-party win handling.
# 2026-07-04 狼人杀动物园模式补充

- 默认狼人杀配置与 seed 新增 `animal-zoo-12`。
- 新增角色配置：`penguin`、`fox`、`rabbit`；新增可执行动作白名单：`freeze`、`foxInspect`。
- 20-21 黑商板子涉及动态授予跨角色技能，暂作为专项后续接入。

## Werewolf Mode 29 Server Notes

- Default config adds `wolf-escape-10` with 3 `escape_hunter`, 2 `tamed_werewolf`, 1 `thick_wolf`, Seer, Witch and 2 Villagers.
- `escape_hunter_speech` and `escape_hunter_vote` reuse the existing ordered action-window pipeline. All living hunters vote, and deterministic plurality resolves one non-hunter target.
- Witch antidote resolves against `escapeHunterTarget`; Seer reads `escape_hunter` as wolf-side information.
- The first unresolved hunter hit on `thick_wolf` records `thickWolfHuntHits` and emits `thick-wolf-armor`; the next hunter hit enters the normal death chain.
- `escape_hunter` death shots reuse the existing hunter-shot window and are disabled by witch poison.
- Dedicated victory checks give hunters precedence when all protected wolves are dead, otherwise good wins when all escape hunters are dead.
- Debug mode generates legal hunter speech/votes and uses the escape-hunt target for Witch save decisions.
- No database table, migration, REST route or WebSocket start/control/ack shape was added.

## Werewolf Mode 30 Server Notes

- Default werewolf config now includes `magic-wolf-demon-hunter-12`.
- Default roles now include `magic_wolf` and `demon_hunter`; executable actions include `demonHunterHunt`.
- Server reducers/effects enforce Demon Hunter night-2 eligibility, wolf/good hunt resolution, witch-poison immunity, Magic Wolf self-destruct seal and last-wolf delayed exile death.
- Debug mode emits legal random payloads for `demon_hunter_hunt` and Magic Wolf self-destruct.
- No database table, migration, REST route or WebSocket start/control/ack shape was added.

## Werewolf Mode 31 Server Notes

- Default werewolf config now includes `spirit-wolf-12`.
- Default roles now include `spirit_wolf`; executable actions include `spiritWolfLearn`, `spiritWolfInspect`, `spiritWolfGuard` and `spiritWolfAntidote`.
- Server reducers store Spirit Wolf learned-role state on the player and night action results on `round.night`.
- Server effects enforce Spirit Wolf guard protection, Spirit Wolf antidote save, learned-villager Seer disguise and learned-hunter exile shot reuse.
- Debug mode emits legal random payloads for all Spirit Wolf action windows.
- No database table, migration, REST route or WebSocket start/control/ack shape was added.
## Werewolf Mode 32 Server Notes

- Added default role/mode config for `wolf_witch`, `illusionist`, and `illusionist-wolf-witch-12`.
- Added executable role actions `wolfWitchCurse` and `illusion`.
- Debug mode uses the existing optional special-skill probability for both new role skills, so they can trigger or skip during debug runs.
- No database schema change is required; new state is stored in the existing serialized werewolf runtime state.

## Player Model Fallback

- `players.fallback_model_id` stores one optional backup model reference and is exposed as `fallbackModelId` only through the admin player API.
- The shared LLM boundary keeps the existing single transient retry for network, timeout, 429 and 5xx failures, then invokes the configured backup model once.
- Missing/disabled primary configuration, upstream errors and empty responses can fall back. Invalid JSON uses the backup for the existing correction attempt.
- When an upstream response explicitly reports account arrears, insufficient balance, exhausted free quota, or an overdue bill, the shared LLM boundary immediately marks that model unavailable in memory and persists `models.enabled = 0`. Generic 429 rate limiting does not disable the model.
- Werewolf, debate and player debug chat share this path. If both models fail, the existing game-level fallback behavior remains authoritative.
