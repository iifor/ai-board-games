# 前端关键信息

## 前端包划分

项目有两个 React 前端：

- `packages/client`：面向玩家/观众的 C 端游戏前台。
- `packages/admin`：面向运营/配置/调试的 B 端管理后台。

两者都使用 Vite 构建，构建产物由服务端静态托管：

- C 端构建产物：`dist/client`
- B 端构建产物：`dist/admin`

## C 端入口与路由

关键文件：

- `packages/client/src/main.tsx`：C 端 React 挂载入口。
- `packages/client/src/App.tsx`：顶层页面组合。
- `packages/client/src/router/clientRouter.ts`：轻量客户端路由。
- `packages/client/src/hooks/useGameNavigation.ts`：游戏导航状态。

路由规则：

- `/home`：首页。
- `/` 或其他未匹配路径：游戏选择页。
- `/games/debate`：辩论赛。
- `/games/werewolf`：狼人杀。
- `/games/:gameKey?gameId=xxx`：历史对局回放。

`App.tsx` 只负责路由分发和页面组合：

- `HomePage`
- `GameSelectPage`
- `DebateGame`
- `WerewolfGame`

## C 端业务模块

### 通用模块

- `packages/client/src/services/gameService.ts`
  - 封装 C 端 REST API。
  - 封装 WebSocket 建连。
  - 负责解析统一 API 返回结构。
- `packages/client/src/hooks/useGameSocketSession.ts`
  - 管理 WebSocket 生命周期。
  - 管理自动播放、暂停、继续、跳过当前回放阶段。
  - 处理服务端 `ackId`，在字幕/语音播放完成后发送 `ack`。
- `packages/client/src/hooks/useSpeechQueue.ts`
  - 管理语音播放队列。
- `packages/client/src/hooks/useSpeechPlayback.ts`
  - 浏览器语音播放通用逻辑。
- `packages/client/src/components/common/*`
  - 通用弹窗、主持人座位、玩家详情等组件。

### 辩论赛模块

目录：`packages/client/src/features/debate`

主要职责：

- `DebateGame`：辩论赛主容器，组合状态、控制区、队伍面板、竞技场、结果等。
- `components/*`：辩论赛 UI 组件，例如队伍列、座位、辩题弹窗、阶段时间线、结果弹窗。
- `hooks/useDebateSpeechPlayback.ts`：辩论发言播放逻辑。
- `utils/*`：队伍、阶段、文本、报告、导入等工具。
- `constants.ts`：辩论赛常量。

### 狼人杀模块

目录：`packages/client/src/features/werewolf`

主要职责：

- `WerewolfGame`：狼人杀主容器。
- `components/*`：座位、竞技场、夜晚遮罩、角色配置、进度面板、淘汰面板、结果等 UI。
- `hooks/useWerewolfSpeechPlayback.ts`：狼人杀语音/字幕播放逻辑。
- `utils/*`：角色、玩家、夜间行动、回合、事件日志等工具。
- `constants.tsx`：狼人杀前端常量。

## C 端 API 调用

`gameService.ts` 暴露的主要能力：

- `fetchAiHealth()`：获取 AI 玩家和服务端配置状态。
- `fetchAiPlayers()`：获取玩家列表。
- `fetchPlayerSelections()`：获取不同游戏类型的玩家选择。
- `savePlayerSelection(gameType, playerIds)`：保存玩家选择。
- `fetchWerewolfModes()`：获取狼人杀模式。
- `fetchRecentGames(gameType, limit)`：获取历史对局。
- `fetchGameDetail(id)`：获取对局详情。
- `openGameSocket(options)`：打开游戏 WebSocket。

## WebSocket 前端协议

建立连接后，前端发送：

```json
{
  "type": "start",
  "mode": "real",
  "gameType": "werewolf",
  "playerIds": [1, 2, 3],
  "hostId": 1,
  "replayGameId": "optional"
}
```

服务端事件可能带 `ackId`。如果存在 `ackId`：

1. 前端先更新界面。
2. 前端播放语音/字幕或等待指定延迟。
3. 播放结束后发送：

```json
{
  "type": "ack",
  "ackId": 1
}
```

播放控制：

```json
{
  "type": "control",
  "action": "pause"
}
```

可用 action：

- `pause`
- `resume`
- `skip-phase`

## B 端管理后台

关键文件：

- `packages/admin/src/main.tsx`
- `packages/admin/src/components/AdminPage/index.tsx`
- `packages/admin/src/services/adminApi.ts`

后台路由：

- `/dashboard`：仪表盘。
- `/debate/history`：辩论赛历史。
- `/werewolf/history`：狼人杀历史。
- `/werewolf/roles`：狼人杀角色管理。
- `/werewolf/modes`：狼人杀模式管理。
- `/consensus/history`：旧共识迷图历史入口。
- `/consensus/skins`：皮肤管理。
- `/players`：玩家管理。
- `/models/providers`：模型供应商管理。
- `/models/providers/:providerId`：供应商下模型管理。
- `/voices`：音色管理。
- `/traces`：AI 观测。
- `/workflow-debug`：工作流调试。

## 前端边界

- 前端负责页面渲染、交互、表单状态、API 调用、loading/error/empty 状态。
- 前端不负责最终权限判断。
- 前端不保存密钥。
- 前端不决定核心游戏结果，只消费服务端游戏状态。

