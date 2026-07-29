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

## 稳定目录边界

本节只记录 C 端长期稳定的职责边界，帮助判断改动应落在 page、feature、hook、service、style 还是 shared 消费层；具体文件位置、符号定义、调用方和影响面使用 CodeGraph 查询。

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
    │   ├── werewolf/
    │   │   ├── WerewolfGame/
    │   │   ├── components/
    │   │   ├── hooks/
    │   │   ├── utils/
    │   │   └── constants.tsx
    │   └── undercover/            # 谁是卧底公开状态、控制器与六人展示
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
    ├── styles/                  # 全局样式、游戏布局、C 端赛事视觉变量
    ├── types/
    └── utils/
```

## 架构设计

`App.tsx` 只负责路由分发和页面组合，不承载复杂业务逻辑。业务逻辑按 feature、hook、service、utils 拆分：

- 页面层：`HomePage`、`GameSelectPage` 负责页面布局和组合。
- 业务模块：`features/debate`、`features/werewolf`、`features/undercover` 承载具体游戏 UI 和业务展示。
- 服务层：`services/gameService.ts` 封装 REST 和 WebSocket。
- hooks 层：封装导航、WebSocket session、语音播放、字幕队列。
- 通用组件：弹窗、导航、状态视图、字幕等可复用 UI。
- 样式层：`styles/game-theme.css` 提供 C 端狼人杀和辩论赛共用的沉浸竞技视觉变量，具体组件 CSS 只负责各玩法布局和状态表达。

路由规则：

- `/home`：首页。
- `/` 或未匹配路径：游戏选择页。
- `/games/debate`：辩论赛。
- `/games/werewolf`：狼人杀。
- `/games/undercover`：谁是卧底经典入口。
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
  - 暂停时保留当前待确认事件并允许继续后重新播放；关闭语音时只确认当前活跃 ack 一次，后续事件沿用无语音延迟确认。
  - 播放完成回调绑定当前会话代次与 ack；回放跳过阶段时本地丢弃该阶段待确认事件、计时器及延后队列，等待服务端下一事件，不发送被跳过事件的 ack。

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

- 辩论赛开局弹窗提供“调试模式”开关。开启后仍通过现有 WebSocket `start`
  消息发送 `debugMode: true`；回放入口强制关闭调试模式。
- 调试模式沿用正式事件队列、字幕和浏览器语音，不新增独立页面或播放链路。
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

### 谁是卧底模块

目录：`packages/client/src/features/undercover`

- `UndercoverGame`：`standard-6` 实时与历史回放共用的单页容器，只组合控制区、公开竞技场和错误状态；游戏选择页和开局前再次校验恰好 6 个唯一玩家 ID。
- `useUndercoverGame`：消费通用 WebSocket session、语音队列和 ACK；仅保存服务端公开状态，票型事件只归一化轮次、加赛、汇总计数、平票候选和淘汰玩家，逐人投票始终归一为空对象；开局复用导航 sessionStorage 中已选择的 6 个玩家 ID。
- `UndercoverArena`：经典页面保持当前布局；v2 使用 16:9 环形观战舞台，六席位在所有阶段保持固定坐标，发言阶段只显示一个中央人物海报和一处姓名/状态，下三分之一承载字幕与下一位提示。准备、投票和终局复用中央区域，并且只展示服务端公开状态。
- `UndercoverControls`：使用底部悬浮控制条复用开始、暂停/继续、独立语音开关和回放跳过控制语义，不增加新 WebSocket 消息；实时 AI 对局不提供人工投票或跳阶段能力。
- C 端不接收或推导词对、玩家私词、卧底身份、合法投票目标、胜负或淘汰规则；终局前即使收到异常 secret 字段也会清除，只有 completed 结果保留 `reveal`。
- 首版不增加谁是卧底后台管理页、词库/人数/轮数配置、真人行动、MVP 或独立复盘 UI；需求确认后再扩展 shared 公共契约和 feature。

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
pnpm --filter @ai-presenter/client run check
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
- `magician-swap` 会把顶层 `magicianSwap` 合并到当前夜晚，用于展示魔术师交换号码的事件记录和座位角标；实际死亡、查验和药效结果仍以服务端夜间结算快照为准。
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
## C 端 v2 赛事皮肤路由

- `/game/v2/debate`：辩论赛统一 C 端赛事皮肤入口。
- `/game/v2/werewolf`：狼人杀统一 C 端赛事皮肤入口。
- `/game/v2/undercover`：谁是卧底 C 端入口，实时与回放复用同一 Undercover 容器。
- `/games/debate`、`/games/werewolf`、`/games/undercover`：继续作为 v1 回退入口保留。
- 游戏选择页默认进入 `/game/v2/*`；历史回放仍使用 `gameId` 查询参数，例如 `/game/v2/debate?gameId=xxx`。
- `features/debate-v2`、`features/werewolf-v2` 只负责 v2 展示入口和 scoped 样式，复用现有 `features/debate`、`features/werewolf` 游戏容器、WebSocket、语音、字幕、弹窗、服务请求和工具函数。
- `components/GameBroadcastHud` 供辩论 v2 等赛事页复用；狼人杀 v2 使用视角内的阶段标题，避免与双视角舞台重复。`styles/game-theme.css` 是 v2 共用视觉 token 入口。
- v2 皮肤样式必须限定在 `.debate-shell--v2`、`.werewolf-shell--v2` 或 v2 模块 CSS 中，避免污染旧 `/games/*` 路由。

### v2 玩家发言海报

- `components/PlayerPosterSpotlight` 是辩论、狼人杀、谁是卧底三种 v2 舞台共用的纯展示组件；只有当前公开发言事件能够匹配现有玩家时才出现，v1 路由不启用。
- 海报按标准化后的玩家昵称映射到 `/player-posters/*.webp`，图片加载失败时依次降级为玩家头像和姓名标签；组件不推导发言顺序、身份或游戏规则。
- 海报层位于舞台背景之上、席位与字幕等业务 UI 之下，不拦截操作；减少动态效果偏好下关闭过渡动画。
- 谁是卧底 v2 通过 `.undercover-stage--v2` 限定海报、环形席位和字幕覆盖；共享 `PlayerPosterSpotlight` 的默认标签仅在该舞台隐藏，辩论和狼人杀 v2 不受影响。
- 该能力只消费现有前端玩家和公开发言状态，不新增 REST API、WebSocket 消息、TTS/ACK 队列或 shared 协议字段。

## Werewolf v2 专用 Arena 边界

- `/game/v2/werewolf` 不再仅对 v1 `WerewolfArena` 做 CSS 换肤；`features/werewolf-v2/components/WerewolfArenaV2` 承载月夜双视角舞台组合层。
- v2 组合层包含围绕中央舞台的 6+6 无卡片席位、中央阶段/发言/技能展示、左上角模式标签和底部身份或局势摘要；业务状态、WebSocket、语音、回放、弹窗和玩家选择仍复用 `features/werewolf/WerewolfGame` 控制器。
- v2 样式必须限定在 `features/werewolf-v2` 与 `.werewolf-shell--v2`，旧 `/games/werewolf` 继续使用 v1 展示。

## Werewolf v2 双视角展示

- `/game/v2/werewolf` 按开局锁定的 `clientViewMode` 渲染两套独立全屏界面，不在同一页面同时展示上帝层和玩家层。
- `god` 使用完整上帝视角，展示服务端投影提供的全部身份、行动目标、警长流程、票型和 AI 播放状态。
- `player` 使用角色沉浸视角，只展示服务端频道过滤和 `audienceSession.viewerPlayerId` 授权的数据；客户端不得补全其他玩家身份、未公开票型或私有行动。
- 白天发言、警长竞选、放逐投票、狼人/预言家/女巫/守卫夜间行动以及猎人、自爆、骑士、白痴、禁言等公开技能统一归一为只读 AI 展示状态：等待、行动中、已提交、已公布、已跳过。
- 扩展角色复用单目标、双目标、二选一、多选、被动触发和结果揭示模板；事件没有目标或结果字段时只展示阶段和播报，不由客户端推导。
- 双视角继续复用现有 `WerewolfGame` 控制器、WebSocket、事件合并、TTS/字幕、ACK 和精确回放；不新增真人行动提交消息或客户端规则判断。
- `WerewolfGame` 的模式、玩家、视角、调试和主持人配置状态集中在 `hooks/useWerewolfSetup.ts`；控制器只消费 Hook 输出并负责开局会话编排。
- legacy 与 workflow 事件的夜间行动者、技能覆盖、查验目标和猎人触发统一经 `utils/presentationProjection.ts` 的纯 reducer 投影，实时与回放不得分别维护展示状态分支。
- 参考设计中的房间号、邀请、网络信号、在线/准备等项目能力之外的信息不得进入 v2；等待态只展示真实模式入口，配置态继续使用现有模式、AI 玩家、视角和调试配置。
- v2 开局配置以模式选择为主；玩家列表默认折叠，观看视角与调试模式使用底部紧凑开关。经典版继续使用共享 `WerewolfModeDialog` 的原布局。
- 玩家视角未授权的身份直接不渲染，不使用“身份隐藏”等占位文案；说明权限边界或 AI 自动行动的解释性提示不进入游戏舞台。
- v2 右上角复用原返回、开局、暂停/继续和回放跳过回调，以月夜控制坞展示，不增加房间、网络或邀请等虚假能力。
- 当前发言者座位使用脉冲光环、麦克风状态和姓名聚光，并在底部发言条展示实时字幕；主持播报沿用同一条，不新增语音队列。
- 技能舞台直接消费交互解析器的 `actorIds/targetIds/status/template/tone`，展示行动者到目标的关系；六类通用模板统一提供施法入场、目标锁定、选择聚焦、被动触发和结果揭示过渡，`tone` 只控制阵营色彩（狼刀使用红色切割光效）。动作、状态或目标变化时重播当前过渡，未知扩展事件没有字段时仍不推断目标，也不增加按角色分支的动画逻辑。
- 核心角色在通用技能舞台之上复用 `RoleInteractionVisual` 展示狼刀、查验、用药、守护、猎人、白狼王、骑士、白痴和警长流程的只读视觉反馈；结果文案只读取既有事件字段，事件未公布结果时不提前展示。
- 席位公开状态按“发言中 > 警长 > 已退水 > 警长候选 > 已翻牌 > 目标 > 行动中 > 已出局”显示单一高优先级徽标，避免多个角标争抢注意力；退水与白痴翻牌从已投影的回合公开信息恢复，实时与回放表现一致。
- v2 开局、思考和玩家详情弹窗使用同一月夜面板视觉；玩家视角未授权身份在详情弹窗中整段省略。
- v2 存活与出局人数固定在阶段标题下方，避免底部多行字幕遮挡；发言字幕优先使用语音载荷的 `fullText`，复用 `splitPlayableDisplaySegments` 按标点与长度拆行，不截断正文。
- v2 发言期间由底部发言条独占字幕展示；中央舞台不再重复发言、播报或思考正文，只保留阶段、技能状态、行动关系和结果。
- v2 底部发言条在 `speech.playerId` 能匹配现有玩家时展示头像、座位号和昵称；主持播报使用主持标识。字幕复用 `wordBoundaries/currentTimeMs` 时间轴，一次只显示当前语音 cue；没有时间轴时只显示首个拆分句，不一次铺开全文，并以光标动画强调正在播放。
- 夜间视图根据当前 round 的 `phase` 增加夜幕，并仅依据现有 `actionType` 显示狼队、预言家、女巫、守卫或通用夜间角色睁眼提示；上警、查验、用药和狼刀继续复用 `actorIds/targetIds`，通过席位聚光、目标锁定与行动流动画表达，不新增客户端规则判断。
- v2 舞台根据现有 `currentRound.phase` 在同机位昼夜背景间交叉淡入 1.2 秒：白天使用晨光与远景议事村民，夜间使用月夜、空座篝火及环境狼人剪影；剪影不绑定玩家座位，也不表达任何身份信息。
- v2 顶部阶段标题内合并存活/出局人数，不再重复展示当前事件摘要；中央区域遵循“终局战报 > 发言/技能 > 等待阶段”的单一主内容规则。`game.winner` 产生后隐藏阶段标题、身份摘要和事件舞台，仅保留两侧最终席位、中央胜负/MVP 战报、控制区及仍在播放的底部字幕。
## Werewolf 12-player expansion

- C-side werewolf role display recognizes `white_wolf_king` as `白狼王`.
- `self-destruct` display events may carry `targetId`; the client renders both the self-destruct actor and the carried target when present.
- C-side must not decide whether the target is legal, whether a player dies, whether hunter/sheriff follow-up triggers, or whether the game has ended. It only consumes server events and merged game state.
- Real-time play and history replay continue to consume the same final display payloads; no separate replay-only white wolf king rule path should be introduced.

## Werewolf first-batch boards

- C 端识别 `hybrid`、`silence_elder`、`knight` 的名称、图标和身份说明；混血儿在角色配置统计中按平民阵营展示。
- `hybrid-master`、`silence-result`、`knight-duel` 作为服务端事件展示。`silence-result` 会合并 `round.silencedPlayerId`，用于显示禁言对象；`knight-duel` 会合并 `round.knightDuel`，用于展示决斗结果。
- 被禁言玩家是否跳过发言、骑士决斗后是否跳过放逐投票、死亡和胜负均由服务端状态决定；C 端只消费事件和合并状态，不推导技能资格或目标合法性。
- 实时对局和历史回放继续复用同一最终展示载荷，不新增独立播放器或额外 WebSocket 消息。

## Werewolf second-batch boards

- C 端识别 `stalker`、`butterfly` 的名称、图标和身份说明。
- `butterfly-hug` 合并 `night.butterflyTarget`，`stalker-assassinate` 合并 `night.stalkerTarget`，用于夜间行动角标和事件记录。
- 花蝴蝶是否屏蔽技能、潜行者是否有暗杀资格和死亡结算均由服务端决定；C 端不推导目标合法性、技能次数或死亡。

## Werewolf third-batch boards

## Werewolf fourth-batch boards

- C 端识别 `evil_knight` 和 `old_rogue` 的名称、图标和身份说明。
- `evilKnightTrigger`、`oldRoguePendingDeath`、`oldRogueDeath` 均来自服务端快照或事件合并状态；C 端不推导反伤、免疫、延迟死亡或狼美人连死资格。
- 老流氓被猎人枪击的负伤状态可通过 `oldRoguePendingDeath.announced` 展示；女巫毒导致的延迟死亡不公开负伤状态。
- 本批不新增独立播放器，不改变 WebSocket start/control/ack，实时对局和历史回放继续消费同一最终状态。

- C 端识别 `wolf_beauty`、`demon`、`nightmare` 的名称、图标和身份说明。
- `wolf-beauty-charm` 合并 `night.wolfBeautyTarget`，`demon-inspect` 合并 `night.demonInspect`，`nightmare-fear` 合并 `night.nightmareTarget`，用于夜间行动角标和事件记录。
- 狼美人连死、恶灵骑士免毒、噩梦恐惧封技能和所有死亡/胜负均由服务端决定；C 端只消费事件和合并状态，不推导目标合法性、技能资格或死亡。

## Werewolf fifth-batch boards

- C 端识别 `wolf_king`、`dreamer`、`magician` 的名称和图标；`wolf_king` 按狼人阵营统计，`dreamer/magician` 按神职统计。
- `dreamer-dream` 合并 `night.dreamerTarget`，用于事件记录和夜间行动角标；摄梦目标显示为“摄梦”徽章。
- `magician-swap` 合并 `night.magicianSwap`，用于事件记录和夜间行动角标；两个交换目标显示为“交换”徽章。
- 摄梦抵消狼刀/毒药、连梦死亡、摄梦人死亡牵连，以及狼王死亡技能资格均由服务端决定；C 端只展示服务端事件和快照字段。
- 魔术师交换后的狼刀、解药、毒药和查验结算均由服务端决定；C 端不得根据 `magicianSwap` 自行推导死亡或查验阵营。

## Werewolf sixth-batch boards

- C 端识别 `big_bad_wolf`、`fortune_teller`、`hidden_wolf`、`crow`、`bear_tamer` 的名称和图标；大灰狼/隐狼按狼人阵营统计，占卜师/乌鸦/驯熊师按神职统计。
- `fortune-teller-mark` 合并 `night.fortuneTellerMark`，座位显示“标记”徽章。
- `big-bad-wolf-kill` 合并 `night.bigBadWolfTarget`，座位显示“袭击”徽章。
- `crow-curse` 合并 `night.crowCurse` 和 `round.crowCursedPlayerId`，座位显示“诅咒 / 放逐票 +1”徽章。
- `bear-tamer-roar` 合并 `round.bearRoar`，座位显示“咆哮/安静”徽章；该结果可在天亮后继续展示。
- 大灰狼击杀、乌鸦加票、隐狼查验和驯熊师相邻狼人判断均由服务端决定；C 端只展示服务端事件和快照字段。
## Werewolf seventh-batch boards

- C-side role display now recognizes `wild_child`, `bombman` and `nine_tailed_fox`; `wild_child` is grouped with villagers, while `bombman` and `nine_tailed_fox` are grouped with gods.
- Player snapshots may include `wildChildModelId`, `wildChildTransformed` and `nineTailedFoxTails`; round snapshots may include `bombmanBlast`.
- The client only renders these fields and consumes server events/snapshots. It must not decide wild child transformation, bombman blast targets, fox tail loss, death-skill eligibility or win results.
- No new C-side route, REST call or WebSocket start/control/ack shape was added.
# 2026-07-04 狼人杀动物园模式补充

- C 端新增动物园角色显示：企鹅、狐狸、兔子。
- 夜间事件新增 `penguin-freeze` 和 `fox-inspect`，会归并到当前 round 的 `night.penguinFrozenId` 与 `night.foxInspect`。
- 狼人杀夜间 badge 增加企鹅冰冻目标与狐狸三连结果展示。

## 2026-07-04 Black merchant boards

- C-side display recognizes `black_merchant`, `big_tree`, `wolf_elder_brother` and `wolf_younger_brother`.
- Event merge handles `black-merchant-gift`, `lucky-seer-check`, `lucky-witch-poison` and `younger-brother-kill`, updating `night.blackMerchantGift`, `night.luckySeerCheck`, `night.luckyPoisonTarget` and `night.youngerBrotherTarget`.
- Seat badges display pending black-merchant gifts, big-tree wolf-hit count, disabled god skills, younger-brother awakening, lucky check/poison, and younger-brother solo kill.
- Client rendering remains state-driven. The client does not decide gift legality, tree death, god skill loss, younger-brother timing, deaths or win results.
## 2026-07-04 Werewolf modes 23-24 display

- C side receives the new night snapshot fields `wolfSeedInfect`, `heavenlyEyeCheck`, `requesterPrayer`, `requesterTarget` and `requesterReason` through the existing werewolf game snapshot.
- The presentation layer recognizes `wolf_seed_infect`, `heavenly_eye_check`, `requester_pray` and `requester_kill` as badge/action UI hints. No new WebSocket command, REST endpoint or client authority rule is introduced.
- The client may render these as skill badges or action animations, but final legality, faction conversion, deaths and win result remain server-side.

## 2026-07-04 Werewolf modes 25-26 display

- C side receives `night.thiefChoice`, `night.loverLink` and `night.succubusLink` through the existing werewolf round snapshot.
- The presentation layer recognizes `thief_choose`, `cupid_link` and `succubus_link` as badge/action UI hints.
- The client remains display-only for thief choice, lover links, third-party conversion, lover death and win results.
## Werewolf Mode 27 Client Surface

- C-side werewolf state accepts `ghostBrideLink`, `ghostBrideChat`, `ghostBrideTarget` and `ghostBrideReason` on `round.night`.
- Player snapshots accept `ghostBridePartnerId`, `ghostBrideWitnessId` and `witnessForGhostBride` so seats can identify the Ghost Bride group.
- Workflow display maps `ghost_bride_link`, `ghost_bride_chat` and `ghost_bride_kill` to `ghost-bride-link`, `ghost-bride-chat` and `ghost-bride-kill`.
- Existing night action actor highlighting is reused for Ghost Bride animations/styles; no new page-level chat UI was added.
- Night badges show the groom/witness link, Ghost Bride private-chat state, and Ghost Bride kill target.
- `RoundProgressPanel` now renders `night.ghostBrideChat` as a read-only Ghost Bride private-chat transcript with speaker seat and day labels; this reuses existing event snapshots and does not add a live chat input or WebSocket command.

## Werewolf Mode 28 Client Surface

- C-side role display recognizes `sapling` as `树苗` and groups it with villager-style display.
- Firepower mode uses existing role action visuals for White Wolf King, Demon, Wolf Beauty, Hidden Wolf, Fox, Witch, Hunter, Guard, Idiot and Big Tree.
- Sapling-linked Big Tree death is received through the normal server snapshot death list; the client remains display-only and does not decide Sapling survival, Big Tree death or god-skill loss.
- No new route, REST call, WebSocket command or client-authoritative rule was added.

## Werewolf Mode 29 Client Surface

- C-side role metadata recognizes `escape_hunter`, `tamed_werewolf` and `thick_wolf`.
- `escape-hunter-speech` and `escape-hunter-vote` highlight all living Escape Hunters through the existing night-actor presentation.
- Hunter vote completion displays the shared hunt target on hunter seats. `thick-wolf-armor` highlights Thick Wolf and displays an animated armor-break badge.
- Player view receives hunter speech, choices, tally and target only for an Escape Hunter viewer; other player roles receive empty hunter-team night fields.
- The client remains display-only. Hunt resolution, armor consumption and victory decisions stay on the server.
- No new route, REST call or WebSocket command was added.

## Werewolf Mode 30 Client Surface

- C-side role display recognizes `magic_wolf` and `demon_hunter`.
- `demon-hunter-hunt` events merge `night.demonHunterTarget` and optional `night.demonHunterReason` into the current round.
- Night badges render Demon Hunter's selected target for the `demon-hunter-hunt` phase.
- Magic Wolf seal, delayed death, Demon Hunter hunt legality and all deaths remain server-authoritative; the client only renders events and snapshots.
- No new route, REST call, WebSocket command or client-authoritative rule was added.

## Werewolf Mode 31 Client Surface

- C-side role display recognizes `spirit_wolf`.
- `spirit-wolf-learn`, `spirit-wolf-inspect`, `spirit-wolf-guard` and `spirit-wolf-antidote` events merge into `round.night.spiritWolfLearn`, `spiritWolfInspect`, `spiritWolfGuardTarget` and `spiritWolfAntidoteTarget`.
- Night badges render Spirit Wolf learning, inspect result, guard target and antidote save target using the existing night action animation/highlight flow.
- Spirit Wolf skill legality, learned role state, protection, poison save, hunter-shot eligibility and all deaths remain server-authoritative.
- No new route, REST call, WebSocket command or client-authoritative rule was added.
## Werewolf Mode 32 Client Notes

- Added role labels/icons for `wolf_witch` and `illusionist`.
- Added event labels and event-state merging for `wolf-witch-curse` and `illusionist-illusion`.
- Night badges now show the Wolf Witch curse target and Illusionist illusion target on the acting player's panel when the matching night event is active.

## Werewolf v2 foreground projection

- The foreground interaction stage retains the latest recognized gameplay action. Technical synchronization, phase narration, ACK and unknown workflow events update state without replacing the foreground card.
- `werewolf_action_skipped` never replaces the foreground interaction. This also protects historical replays that already contain skipped events for roles absent from the selected board.
- A day/night phase change clears the retained interaction before the next recognized action, so a night skill card cannot leak into the daytime stage or vice versa.
- The bottom speech bar and player poster are reserved for speech attributed to a real player. Host and system narration continue through the existing playback/stream message path without creating transient foreground panels.
- `actionWindow.targetIds` is an eligibility set, not a resolved selection. The foreground target relation and seat target badges render only explicit submitted or resolved target fields from display events.
- This is a client presentation rule only. WebSocket events, ACK timing, replay payloads and server-authoritative game state are unchanged.
- 发言人物使用 `/player-poster-cutouts/` 下由 `resolvePlayerPoster` 映射的同名透明 WebP；只展示人物主体。
- 透明立绘失败时依次回退玩家头像和姓名首字母，不回退旧海报。
- 发言期间中央交互层隐藏，人物位于顶部阶段栏与底部字幕之间的安全区。
- 其他游戏模式继续使用 `/player-posters/` 下由 `resolvePlayerPoster` 映射的同名海报 WebP。
