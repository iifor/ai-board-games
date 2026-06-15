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
- 实时与回放继续各自创建连接，但消费同一套最终展示事件格式。
- 新狼人杀回放绑定对局原始视角，客户端不能请求提升或切换回放视角。

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
- `wolf-vote/seer-check/guard-action/witch-action` 会把顶层完成字段合并到当前夜晚；女巫解药与毒药必须按 `actionType` 分流，完成事件不能回退为睁眼态。
- 狼人座位在授权视角显示最终“刀 X 号”，预言家座位显示“查 X 号 / 好人或狼人”，女巫座位显示“毒 X 号”或“不毒”。
- 女巫选择不使用毒药时仍消费 `witch-action` 并展示“不毒”，但该事件没有旁白、TTS 或语音 ACK；实时与精确回放使用相同最终载荷。
- 预言家、守卫、女巫的有效技能结果带有可选原因时，C 端直接播放服务端生成的 `presentation.speakableText`；原因不单独排队，不读取或播报模型 thinking。夜间原因沿用事件 scope 视角权限，猎人开枪原因随公开 `hunter-shot` 播报。
- 新对局精确回放保存最终播报文本；没有精确播放事件的旧对局从夜间快照中的可选原因重建相同结果旁白。
- `last-words` 和 `exile-words` 继续复用现有 testimony UI。首夜遗言和放逐遗言由服务端决定资格与顺序，C 端不自行推导。
- `sheriff-result`、`sheriff-badge-transfer/tear` 是公开系统播报。事件携带最新 `sheriffId/sheriffBadge`；当选后显示警徽，移交后移动警徽，撕毁后清除警徽。
## 狼人杀首日播放与异常状态

- 首日播放顺序为警长结果、夜死公布，然后逐人播放“遗言 -> 死亡技能 -> 警徽决定”，最后播放胜负结果；遗言继续使用现有 `last-words` 展示和语音 ACK 队列。
- 女巫当夜已使用解药时，毒药阶段由服务端静默跳过，C 端不会收到额外行动或跳过展示。
- 服务端 match 为 `failed` 或 `paused_debug` 时，Socket 只发送现有 `error` 事件，不发送 `workflow-completed`。C 端保留错误状态，不展示比赛结束结果。
## 狼人杀赛后展示

- `WerewolfResult` 在胜负锁定后显示获胜阵营和原因，并随状态更新展示 MVP、公开身份、票数与逐票记录。
- `mvp-vote` 仅更新展示，不进入语音播放；`mvp-result` 使用主持人 `presentation.speakableText`。
- `postgame_speech` 复用既有 `speech`、玩家音色、字幕、ACK 与精确回放管线，不新增播放器或 WebSocket 消息。
## 狼人杀终局与技能语音

- 技能结果事件携带 `speech.playerId` 时，C 端按该玩家的 `voicePackageId` 播放；
  未携带玩家发言信息的阶段提示继续使用主持人音色。
- 游戏胜负锁定后会收到 `day-start`，最终 round 保持 `phase: day`，终局界面不得
  回退为天黑状态。
- 赛后播放顺序为天亮、`mvp-start` 主持人口播、静默 MVP 逐票、`mvp-result`
  主持人公布、玩家 `postgame_speech`。
