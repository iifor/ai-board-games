# API、数据与测试

## API 分层

服务端 API 分为两类：

- `/api/toc/*`：C 端游戏前台使用。
- `/api/admin/*`：B 端管理后台使用。

WebSocket：

- `/api/toc/ws/game`

统一响应结构来自 `packages/shared/types/apiTypes.ts` 和服务端 `responseFormatter`，常见形态：

```ts
{
  code: number | string;
  message: string;
  data?: unknown;
}
```

## C 端 API

封装文件：`packages/client/src/services/gameService.ts`

主要接口：

- `GET /api/toc/health`
  - 获取 AI 玩家、配置状态等。
- `GET /api/toc/player-selections`
  - 获取各游戏类型已保存的玩家选择。
- `PUT /api/toc/player-selections/:gameType`
  - 保存某个游戏类型的玩家选择。
- `GET /api/toc/werewolf-modes`
  - 获取启用的狼人杀模式。
- `GET /api/toc/games/recent?gameType=...&limit=...`
  - 获取历史对局列表。
- `GET /api/toc/games/:id`
  - 获取对局详情。

WebSocket 首包：

```ts
type GameSocketStartPayload = {
  type: 'start';
  mode: 'real';
  gameType: string;
  playerIds?: number[];
  hostId?: number | string;
  topic?: Partial<DebateTopic> | null;
  debateTeams?: Partial<DebateTeamDraft> | null;
  werewolfMode?: string;
  clientViewMode?: string;
  replayView?: boolean;
  replayGameId?: string;
};
```

## 管理后台 API

后台页面统一使用 `packages/admin/src/services/adminApi.ts` 封装请求。

主要资源：

- 玩家：`players`
- 模型供应商：`model-providers`
- 模型：`models`
- 音色：`voices`
- 狼人杀角色和模式：`werewolf-config`
- 对局历史：`games`
- 皮肤：`skins`
- 上传：`upload`
- 设置：`settings`
- 观测：`observability`
- 工作流调试：`workflow-engine`

## 工作流调试 API

挂载在 `/api/admin` 下，路由来自 `packages/server/modules/workflow-engine/routes.ts`：

- `GET /workflow/matches/:matchId/debug`
  - 查看 match、state、events、tasks、pending actions 等调试信息。
- `POST /workflow/matches/:matchId/tick`
  - 手动推进 match。
- `POST /workflow/matches/:matchId/actions/:actionId/submit`
  - 提交 pending action。
- `POST /workflow/ai-tasks/:taskId/retry`
  - 重试 AI task。
- `POST /workflow/ai-tasks/:taskId/cancel`
  - 取消 AI task。
- `POST /workflow/ai-tasks/:taskId/manual-complete`
  - 人工完成 AI task。
- `POST /workflow/matches/:matchId/interrupts`
  - 创建 interrupt。
- `POST /workflow/interrupts/:interruptId/resolve`
  - 解决 interrupt。

## 关键数据表

### 配置表

- `players`：AI 玩家资料、模型、音色、人格、排序、启用状态。
- `model_providers`：模型供应商、baseUrl、apiFormat、加密 key。
- `models`：具体模型配置。
- `voice_packages`：语音包。
- `werewolf_roles`：狼人杀角色。
- `werewolf_modes`：狼人杀模式和角色配置。
- `skins`：皮肤/主题资源。
- `app_settings`：应用设置。

### 对局表

- `games`：完整对局快照、赢家、原因、玩家、回合、事件、音频资源。
- `game_players`：对局与玩家快照关联。
- `game_player_selections`：不同游戏类型的默认玩家选择。

### 工作流表

- `matches`：当前 match 状态。
- `match_snapshots`：match 快照。
- `workflow_events`：事件流。
- `ai_tasks`：AI 任务队列和结果。
- `pending_actions`：待提交行动。
- `outbox_messages`：待推送给前端的消息。
- `action_window_epochs`：行动窗口生命周期。
- `workflow_effects`：待应用或已应用的游戏效果。
- `workflow_interrupts`：特殊中断，例如猎人开枪、狼人自爆等。
- `memory_snapshots`：记忆快照。

### 观测表

- `game_traces`：一局游戏的 trace。
- `trace_spans`：trace span。
- `llm_records`：LLM 请求/响应记录。
- `agent_decisions`：agent 决策记录。
- `game_events`：观测事件。
- `state_snapshots`：状态快照。

## 共享类型

目录：`packages/shared`

主要文件：

- `types/apiTypes.ts`：API 响应类型。
- `types/gameTypes.ts`：游戏事件类型和游戏类型常量。
- `types/workflowTypes.ts`：工作流状态、AI task、pending action、effect、interrupt 等常量。
- `types/speechTypes.ts`：语音相关类型。
- `types/channelTypes.ts`：事件通道/可见性相关类型。
- `schemas/gameSchemas.ts`：游戏参数校验 schema。
- `schemas/workflowSchemas.ts`：工作流参数校验 schema。
- `constants/gameLimits.ts`：游戏限制常量。

## 测试

工作流测试目录：`tests/workflow`

现有测试覆盖：

- `werewolfReducers.test.ts`
- `werewolfEffects.test.ts`
- `werewolfActionWindow.test.ts`
- `werewolfFakeWorkflow.test.ts`
- `tickCompleted.test.ts`
- `eventProjection.test.ts`

运行命令：

```powershell
pnpm run test:workflow
```

## 后续补充测试建议

- 为 `/api/toc` 的 REST 接口补充集成测试。
- 为 WebSocket `start/ack/control/replay` 补充端到端测试。
- 为辩论赛 `judge_review`、`vote_mvp` 的异常 AI 输出补充测试。
- 为狼人杀不同模式的角色数量、胜负条件、视角投影补充测试。
- 为后台工作流调试 API 补充权限和参数校验测试。

