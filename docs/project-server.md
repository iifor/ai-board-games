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

## 目录结构

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

记忆管理 API：

- `GET /api/admin/player-memories/stats`
- `POST /api/admin/player-memories/clear`，请求体 `gameType` 仅允许 `werewolf`、`debate`、`all`

清除操作只删除跨局长期画像，不删除进行中的 `memory_snapshots`、历史比赛、Trace 或玩家基础人格。

## 配置与部署

启动与构建：

```bash
pnpm run dev:server
pnpm run build:server
pnpm run start
pnpm run check:server
```

环境变量：

- `.env.example` 提供语音、TTS、Cloudflare、数据库模型密钥示例。
- `config/env.ts` 会从根目录或 server 上级目录加载 `.env`。
- 模型运行时 key 主要通过数据库模型配置或 `DATABASE_MODEL_API_KEY` 兜底。

静态资源：

- `/resources` 指向上传资源根目录。
- `/admin` 托管后台构建产物。
- 根路径托管 C 端构建产物。
- 服务端端口和根命令以 `docs/project-summary.md` 为准。

## 扩展点与注意事项

- 新增后端 API 时优先放入 `modules/<moduleName>`，不要堆到 `app.ts` 或 `index.ts`。
- controller 不写复杂业务逻辑，repository 不写业务规则。
- 所有用户输入必须通过 validator/schema 校验。
- 敏感信息不得写入代码或返回前端。
- API 错误必须交给统一错误处理，不允许静默 catch。
- 修改 API、数据库表、配置或模块边界时，同步更新 `docs/project-server.md` 和相关文档。
