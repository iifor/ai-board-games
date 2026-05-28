# 后端关键信息

## 后端入口

关键文件：

- `packages/server/index.ts`
  - 创建 HTTP server。
  - 调用 `createApp()`。
  - 调用 `attachGameSocket(server)`。
  - 监听端口，默认开发端口 `3001`。
- `packages/server/app.ts`
  - 创建 Express app。
  - 注册辩论工作流。
  - 初始化种子数据。
  - 挂载中间件、管理后台 API、C 端 API、静态资源和 SPA fallback。

## Express 中间件

目录：`packages/server/middlewares`

- `responseFormatter.ts`：统一响应格式。
- `errorHandler.ts`：统一错误处理。
- `validate.ts`：请求参数校验中间件。

后端 API 需要避免把数据库错误、服务器路径、密钥等敏感信息直接返回给前端。

## API 路由挂载

### 管理后台 API

统一挂载在 `/api/admin`：

- `upload`
- `skins`
- `players`
- `model-providers`
- `models`
- `voices`
- `werewolf-config`
- `games`
- `settings`
- `observability`
- `workflow-engine`

对应模块大多遵循：

```txt
packages/server/modules/<moduleName>/
  controller.ts
  service.ts
  repository.ts
  routes.ts
  validator.ts
  types.ts
  constants.ts
  utils.ts
  index.ts
```

### C 端 API

统一挂载在 `/api/toc`：

- REST 路由来自 `packages/server/routes/gameRoutes.ts`。
- WebSocket 路径是 `/api/toc/ws/game`。

## WebSocket 服务

目录：`packages/server/modules/game-socket`

关键文件：

- `service.ts`
  - `attachGameSocket`：挂载 WebSocketServer。
  - `runSession`：启动真实游戏或回放。
  - `getRequestConfig`：解析玩家、主持人、模式、模型 key 状态。
  - `getRunner`：按 `gameType` 选择游戏 runner。
- `session.ts`
  - 封装 `send`、`sendAndWait`、`resolveAck`、`pause/resume`、`skipCurrentPhase`。
  - 对需要等待前端播放的事件注入 `ackId`。
  - 对发言类事件设置超时保护。
- `sender.ts`
  - 准备和推送事件。
  - 维护音频资源。
- `replay.ts`
  - 历史对局回放。
- `narration.ts`、`media.ts`
  - 事件旁白和媒体资源处理。

## 游戏分发

`runSession` 的核心分发逻辑：

- `gameType === "debate"`：调用 `runAiDebate`。
- 其他或 `werewolf`：调用 `runWerewolfWorkflow`。

游戏完成后：

1. `sender.flush()` 推完待发事件。
2. `saveGameRecord` 保存完整对局和音频资源。
3. 发送 `workflow-completed`。
4. 关闭 WebSocket session。

## 数据库层

目录：`packages/server/db`

关键文件：

- `index.ts`：数据库初始化入口。
- `migrations.ts`：SQLite 表结构创建和字段补齐。
- `fallback.ts`：JSON fallback 数据库。
- `seed.ts`：默认数据。

核心表：

- 配置类：
  - `players`
  - `model_providers`
  - `models`
  - `voice_packages`
  - `werewolf_roles`
  - `werewolf_modes`
  - `skins`
  - `app_settings`
- 对局类：
  - `games`
  - `game_players`
  - `game_player_selections`
- 工作流类：
  - `matches`
  - `match_snapshots`
  - `workflow_events`
  - `pending_actions`
  - `ai_tasks`
  - `outbox_messages`
  - `memory_snapshots`
  - `action_window_epochs`
  - `workflow_effects`
  - `workflow_interrupts`
- 观测类：
  - `game_traces`
  - `trace_spans`
  - `llm_records`
  - `agent_decisions`
  - `game_events`
  - `state_snapshots`

## AI 与模型配置

相关目录：

- `packages/server/config`
- `packages/server/modules/llm`
- `packages/server/modules/tts`
- `packages/server/modules/agent-core`
- `packages/server/modules/model-providers`
- `packages/server/modules/models`

主要职责：

- `config` 读取环境变量、模型配置和运行配置。
- `model-providers` 和 `models` 管理供应商、baseUrl、apiFormat、加密后的 API key。
- `llm` 负责模型调用和缓存。
- `tts` 负责语音合成和缓存。
- `agent-core` 提供玩家 agent、技能注册、技能执行和 fallback audit。

## 错误与稳定性机制

- API 通过统一错误处理中间件处理异常。
- WebSocket session 关闭时会取消所有 pending ack。
- 发言事件有 ack 超时保护。
- AI task 有失败、重试、人工完成、取消等状态。
- 工作流引擎支持暂停到 `paused_debug`，方便后台调试。
- 工作流事件使用 idempotency key 避免重复提交。

