# C 端游戏前台架构

## 项目概述

C 端位于 `packages/client`，面向玩家和观众，负责游戏选择、玩家选择、实时游戏展示、语音/字幕播放、WebSocket ack、暂停/继续/跳过和历史回放。

## 技术栈

- React 18
- React DOM
- React Router
- Vite
- TypeScript
- lucide-react
- `@ai-presenter/shared`

## 目录结构

```txt
packages/client/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.mjs
├── vite-env.d.ts
├── public/
└── src/
    ├── main.tsx                 # React 挂载入口
    ├── App.tsx                  # 顶层路由分发和页面组合
    ├── asserts/                 # 游戏图片资源
    ├── components/
    │   ├── common/
    │   │   ├── BaseModal/
    │   │   ├── HostSelector/
    │   │   ├── PlayerDetailModal/
    │   │   └── ThinkingModal/
    │   ├── PanelTitle/
    │   ├── SpeechSubtitle/
    │   ├── StateViews/
    │   └── TopNav/
    ├── constants/
    ├── features/
    │   ├── debate/
    │   │   ├── DebateGame/
    │   │   ├── hooks/
    │   │   ├── utils/
    │   │   ├── constants.ts
    │   │   ├── debatePoster.ts
    │   │   └── debateUtils.ts
    │   └── werewolf/
    │       ├── WerewolfGame/
    │       ├── components/
    │       ├── hooks/
    │       ├── utils/
    │       └── constants.tsx
    ├── hooks/
    │   ├── speech/
    │   ├── useGameNavigation.ts
    │   ├── useGameSocketSession.ts
    │   ├── useSpeechPlayback.ts
    │   └── useSpeechQueue.ts
    ├── pages/
    │   ├── GameSelectPage/
    │   └── HomePage/
    ├── router/
    │   └── clientRouter.ts
    ├── services/
    │   └── gameService.ts
    ├── styles/
    ├── types/
    └── utils/
```

## 架构设计

`App.tsx` 只负责路由分发和页面组合，不承载复杂业务逻辑。业务逻辑按 feature、hook、service、utils 拆分：

- 页面层：`HomePage`、`GameSelectPage` 负责页面布局和组合。
- 业务模块：`features/debate`、`features/werewolf` 承载具体游戏 UI 和业务展示。
- 服务层：`services/gameService.ts` 封装 REST 和 WebSocket。
- hooks 层：封装导航、WebSocket session、语音播放、字幕队列。
- 通用组件：弹窗、导航、状态视图、字幕等可复用 UI。

路由规则：

- `/home`：首页。
- `/` 或未匹配路径：游戏选择页。
- `/games/debate`：辩论赛。
- `/games/werewolf`：狼人杀。
- `/games/:gameKey?gameId=xxx`：历史对局回放。

## 核心模块

### 通用能力

- `gameService.ts`
  - `fetchAiHealth()`：获取 AI 玩家和服务端配置状态。
  - `fetchAiPlayers()`：获取玩家列表。
  - `fetchPlayerSelections()`：获取不同游戏类型的玩家选择。
  - `savePlayerSelection(gameType, playerIds)`：保存玩家选择。
  - `fetchWerewolfModes()`：获取狼人杀模式。
  - `fetchRecentGames(gameType, limit)`：获取历史对局。
  - `fetchGameDetail(id)`：获取对局详情。
  - `openGameSocket(options)`：建立游戏 WebSocket。

- `useGameSocketSession`
  - 管理 WebSocket 生命周期。
  - 处理服务端事件、ack、暂停、继续、跳过当前阶段。
  - 对接语音/字幕播放完成后的 ack。

- `useSpeechQueue` / `useSpeechPlayback`
  - 管理语音播放队列。
  - 封装浏览器语音播放和播放状态。

### 辩论赛模块

目录：`packages/client/src/features/debate`

- `DebateGame`：辩论赛主容器，组合状态、控制区、队伍面板、竞技场和结果。
- `hooks/useDebateSpeechPlayback.ts`：辩论发言播放逻辑。
- `utils/team.ts`：队伍相关工具。
- `utils/phase.tsx`：阶段展示相关工具。
- `utils/report.ts`：报告生成相关工具。
- `constants.ts`：辩论赛常量。

### 狼人杀模块

目录：`packages/client/src/features/werewolf`

- `WerewolfGame`：狼人杀主容器。
- `components/RoleConfigPanel`：角色配置。
- `components/WerewolfArena`：游戏场景。
- `components/WerewolfSeat`：玩家座位。
- `components/WerewolfControls`：播放和控制区。
- `components/RoundProgressPanel`：回合进度。
- `components/EliminationPanel`：淘汰信息。
- `hooks/useWerewolfSpeechPlayback.ts`：狼人杀语音/字幕播放逻辑。
- `utils/roles.ts`、`players.ts`、`rounds.ts`、`nightActions.ts`、`eventLog.tsx`：游戏展示工具。

## WebSocket 客户端职责

WebSocket 协议以 `docs/project-workflow.md` 为唯一来源。C 端负责：

- 通过 `gameService.openGameSocket(options)` 建立连接。
- 在 `useGameSocketSession` 中发送 start/control/ack 消息。
- 收到服务端事件后更新 UI，并在语音、字幕或延迟完成后回复 `ack`。
- 处理暂停、继续、跳过当前阶段和回放视图状态。

## 配置与部署

常用命令：

```bash
pnpm run dev:client
pnpm run build:client
pnpm run check:client
```

构建产物输出到 `dist/client`，由服务端静态托管。`dist/` 不作为源码目录维护。

## 扩展点与注意事项

- 新增游戏前台能力优先放入 `src/features/<featureName>`。
- 页面组件只负责布局和组合，复杂 UI 状态抽成 hook 或 store。
- API 请求必须放到 `services`。
- 前端不保存密钥、不做最终权限判断、不决定核心游戏结果。
- loading、error、empty 状态应在前端明确展示。

## Werewolf C 端状态合并约定

狼人杀 C 端不能把每一条 socket 事件携带的 `game` 或 `round` 当成完整真相直接覆盖本地状态。部分 EventBus 事件只包含当前展示所需的局部字段，例如 `vote-result` 的 `votes/tally/exile`、警长事件的 `sheriffElection/sheriffId/sheriffTransfer`。`WerewolfGame` 通过 `utils/gameState.ts` 合并这些局部事件：

- `mergeWerewolfEventIntoGame` 保留已知玩家、round、警徽、警长竞选和投票字段，只用新事件覆盖明确携带的字段。
- `resolveActiveSheriffId` 会从当前 round 和历史 rounds 反查有效警徽，避免进入后续夜晚或下一天后警徽图标消失。
- `vote-result` 事件即使没有完整 `game` snapshot，也会用顶层 `votes/tally/exile` patch 到对应 day 的 round，供座位投票角标展示。
