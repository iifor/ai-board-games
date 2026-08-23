# 共享类型、Schema 与测试

## 项目概述

共享包位于 `packages/shared`，用于沉淀前后端共同依赖的类型、schema、常量、工具和 Vite 插件，减少 API、WebSocket、游戏状态和工作流协议漂移。

## 技术栈

- TypeScript
- zod
- pnpm workspace exports

## 稳定目录边界

本节只记录 shared 包长期稳定的职责边界，帮助判断改动属于类型、schema、常量、工具还是测试契约；具体文件位置、符号定义、调用方和影响面使用 CodeGraph 查询。

```txt
packages/shared/
├── package.json
├── tsconfig.json
├── constants/
│   ├── channelMaps.ts
│   └── gameLimits.ts
├── schemas/
│   ├── gameSchemas.ts
│   ├── gameEngineSchemas.ts
│   ├── avalon.ts
│   ├── undercover.ts
│   ├── skillRegistry.ts
│   └── workflowSchemas.ts
├── types/
│   ├── apiTypes.ts
│   ├── channelTypes.ts
│   ├── gameEngine.ts
│   ├── gameEvent.ts
│   ├── gameTypes.ts
│   ├── avalon.ts
│   ├── undercover.ts
│   ├── speechTypes.ts
│   └── workflowTypes.ts
├── utils/
│   └── channelResolution.ts
└── vite-plugins/
    └── px2vw.mjs

tests/
├── unit/
├── workflow/
└── migration/
```

## 架构设计

共享包通过 `package.json` exports 暴露：

- `@ai-presenter/shared/types/*`
- `@ai-presenter/shared/schemas/*`
- `@ai-presenter/shared/constants/*`
- `@ai-presenter/shared/utils/*`
- `@ai-presenter/shared/vite-plugins/*`

前端和后端都应优先引用共享类型和 schema，避免重复声明协议。

## 核心模块

- `types/playbackTypes.ts`：定义 `PlaybackEvent`、`PlaybackEventSource`、媒体引用和播放协议版本，供实时采集、持久化和回放共同使用。

### 类型

- `apiTypes.ts`：统一 API 响应类型。
- `gameTypes.ts`：游戏类型、游戏状态和通用游戏数据。
- `workflowTypes.ts`：workflow、AI task、pending action、effect、interrupt 等类型。
- `speechTypes.ts`：语音和字幕相关类型。
- `channelTypes.ts`：事件通道和可见性类型。
- `gameEvent.ts`：游戏事件类型。
- `gameEngine.ts`：通用游戏引擎类型，包括 `GameDefinition`、`DomainAction`、`WorkflowEffect`、`DomainEvent`、`ChannelPolicy`、debug state、invariant issue、状态投影契约。
- `avalon.ts`：阿瓦隆标准 5 人公开玩家、任务、比分、终局身份揭示及角色/阵营类型。
- `undercover.ts`：谁是卧底公开玩家、发言、汇总票型、终局揭示和 `standard-6` 公开状态。

### Schema

- `gameSchemas.ts`：游戏参数校验 schema。
- `workflowSchemas.ts`：工作流参数校验 schema。
- `gameEngineSchemas.ts`：游戏引擎 schema，校验 definition、action、effect、event、channel policy 和可选 `projectState`。
- `avalon.ts`：校验组队、组队表决、任务密投与刺杀结构；队伍人数和合法目标仍由服务端当前状态校验。
- `undercover.ts`：校验固定 6 个唯一正整数玩家 ID、1-120 字描述和带 0-80 字可选原因的正整数投票目标。
- `skillRegistry.ts`：技能注册相关 schema。

### 通用 Game Engine 类型

`packages/shared/types/gameEngine.ts` 是 `packages/server/modules/game-engine` 的共享 contract：

- `GameDefinition`：游戏接入点，声明 `gameType`、`version`、`workflowId`、action schema、effect resolver、channel policy，以及可选 runtime、session preparation 和 presentation adapter。
- `GameRuntime` / `GameRuntimeRunContext` / `GameSessionMetadata`：definition 驱动的实时游戏接入点；runtime 支持 `execute()` 或 `createMatch() + run()`，session metadata 声明开场结束事件、玩家数量约束和播放预取参数。`GameRuntimeAbortSignal` 是与标准 `AbortSignal` 结构兼容的最小只读契约，避免 shared 包引入 DOM/Node lib，真实 WebSocket session 仍传入标准信号。
- `PrepareGameSession`：把可用玩家、请求玩家、已保存选择和 WebSocket 请求转换为本局玩家及额外 config；普通游戏复用 metadata 人数规则，辩论分队和狼人杀动态模式使用自定义实现。
- `GamePresentationAdapter`：为单局创建带状态的公开事件/游戏投影器，避免 session service 内按游戏名处理可见性。
- `DomainAction`：玩家或 AI 在 ActionWindow 内提交的结构化动作，不直接修改状态。
- `WorkflowEffect`：由 action 派生的待结算效果，必须由 resolver 统一处理。
- `DomainEvent`：唯一事实事件，必须带 `channel`，`scope` 事件必须带 `scopeKey`。
- `ProjectStateFromEvent`：Phase 2 引入的状态投影函数，用于把已落库的 event 投影到 match state。
- `EngineDebugState` / `InvariantIssue`：内部调试和不变量检查输出，不作为公开 HTTP API。

### 常量和工具

- `gameLimits.ts`：游戏限制常量。
- `channelMaps.ts`：事件通道映射。
- `channelResolution.ts`：通道解析工具。
- `px2vw.mjs`：Vite 样式转换插件。

## API 响应约定

推荐统一响应结构：

```ts
{
  code: number | string;
  message: string;
  data?: unknown;
}
```

新增或修改 API 时，应优先在共享类型中定义稳定响应结构，再由前后端共同消费。

## 测试

根目录测试脚本：

```bash
pnpm run test:unit
pnpm run test:workflow
pnpm run test:migration
```

测试目录：

- `tests/unit`：通用单元测试，例如 event bus、game engine contract、socket session、skill event emitter、玩家记忆长度与会话裁剪。
- `tests/workflow`：工作流测试，例如狼人杀 reducer/effects/action window、事件投影，以及阿瓦隆有界调试全流程和秘密字段边界。
- `tests/migration`：迁移和事件映射测试。

测试选择建议：

| 改动类型 | 建议命令 |
| --- | --- |
| reducer、effects、action window、事件投影、游戏流程 | `pnpm run test:workflow` |
| shared 类型消费、基础工具、event bus、socket session、skill emitter | `pnpm run test:unit` |
| 数据库迁移、事件映射、历史兼容 | `pnpm run test:migration` |

Workflow 内部 `StatePatch` 使用路径操作表达状态增量：

- `set: Array<{ path: string[]; value: unknown }>` 设置或替换字段。
- `remove: string[][]` 删除字段。
- 数组不使用索引增量，统一整体替换。

`MatchSnapshot.lastEventSeq` 为可选字段，用于兼容没有事件水位的历史快照。该类型
属于服务端 workflow 恢复协议，不改变 REST、WebSocket 或游戏回放公开载荷。
| 跨包类型或导出调整 | `pnpm run check`，必要时追加相关测试 |

## 谁是卧底共享契约

- `undercoverStartSchema` 在信任边界要求恰好 6 个不重复的正整数 `playerIds`；definition session metadata 同步声明 `min = max = 6`，客户端也在开局前执行相同约束。
- AI 描述 schema 限制为 1-120 字；投票 schema 使用正整数 `targetId` 和最多 80 字的 `reason`。目标是否存活、是否为自己、是否属于复投候选仍由服务端规则校验。
- `UndercoverPublicState` 只描述 `standard-6` 的公开字段。`winner`、`winReason` 与 `reveal` 均为终局可选字段；终局前投影不得出现秘密词、完整词对、玩家私词或卧底座位。
- `UndercoverVoteResult` 的公开消费只使用 `tally/tiedCandidateIds/eliminatedPlayerId/runoff`；服务端不发送逐人 ballot，C 端将 `votes` 归一为空对象以保持既有展示类型稳定。
- `UndercoverReveal` 仅允许出现在 completed 的最终结果事件/状态中，包含平民词、卧底词和卧底玩家 ID。实时与回放使用同一公开类型。
- 以上为内部 shared 类型/schema 扩展，没有新增 REST 响应、WebSocket start/control/ack 字段或数据库 schema；可配置玩法、词库管理、真人行动、MVP 和独立复盘契约均延后。

## 阿瓦隆共享契约

- `AvalonPublicState` 只包含座位、队长、公开队伍、任务状态、聚合票数、比分和可选终局结果；不包含 seed、玩家私有 role/faction、逐人 `teamVotes` 或逐人 `questVotes`。
- `reveal` 仅在 `status = completed` 时出现，包含 5 个玩家的角色和阵营；客户端会再次执行这一终局约束。
- `avalonProposalSchema`、`avalonTeamVoteSchema`、`avalonQuestVoteSchema`、`avalonAssassinationSchema` 只校验载荷形状；人数、候选范围、好人不能出失败票等上下文规则由服务端 handler 二次校验。
- 阿瓦隆复用现有 WebSocket `start/control/ack` 和 workflow PostgreSQL 表，没有新增公共 HTTP API、数据库表或 migration。

## 扩展点与注意事项

- 前后端共享类型优先放入 `packages/shared/types`。
- 参数校验 schema 优先放入 `packages/shared/schemas` 或服务端模块 validator。
- 常量优先放入 `packages/shared/constants`，除非只服务单个模块。
- 修改共享类型时，需要同步检查 client、admin、server 的引用和测试。
- 不允许用大量 `any` 或 `as any` 掩盖协议不清晰问题；确需使用时必须说明原因。

狼人杀夜间完成事件在 `types/gameEvent.ts` 定义稳定 payload：

- `WolfVoteCompletedPayload`：`wolfTarget/wolfChoices/wolfVoteTally`。
- `SeerCheckCompletedPayload`：`seerCheck: { target, result, reason? }`。
- `GuardActionCompletedPayload`：`guardAction: { target, reason? }`。
- `WitchActionCompletedPayload`：`witchAction: { use, target, reason? }`，覆盖解药和毒药。
- `MagicianSwapPayload`：`magicianSwap: { firstTarget, secondTarget, reason? }`。
- `HunterShotPayload`：`shot: { from, target }` 和可选公开 `reason`。

这些类型描述展示事件字段，不改变 REST API 或 WebSocket 连接协议。

神职 `reason` 是可选的简短决策说明，服务端清理首尾空白并最多保留 80 字。原因仅在行动合法且实际生效时进入状态与展示载荷；不得使用 thinking 代替原因，也不得因缺少原因判定输出失败。

狼人杀新增内部行动 `sheriff_speech_direction`，结果为 `{ direction: 'clockwise' | 'counterclockwise', reason?: string }`。狼人击杀胜利锁定属于服务端 round 内部状态，不属于共享展示协议，也不得写入回放播放载荷。

女巫药品耗尽和角色不可行动产生的 `action-skipped` 属于 `channel: system` 的内部审计事件，不进入共享播放事件或 C 端回放载荷。`usedAntidote/usedPoison` 仍是服务端判断药品库存的状态来源。

展示事件的 `presentation.requiresAck` 用于区分需要等待语音播放的事件与纯 UI 状态事件。女巫“不毒”的 `witch-action` 设置 `requiresAck: false`、空 `speakableText` 和 `suppressSpeech: true`，事件仍进入 `PlaybackEvent` 持久化，但不注入连接态 `ackId`。

`last_words` 是服务端内部死亡行动，允许已死亡玩家作为 actor；公开协议继续使用既有 `last-words`、`exile-words`。内部 `pendingLastWords` 和 `winnerLock` 不属于共享快照或回放载荷。狼人杀模式 `winCondition` 的正式值为 `side/gods/villagers/all`，旧 `single` 仅作为输入兼容并归一化为 `side`。

`SheriffEventPayload` 可选携带 `sheriffId/sheriffBadge`。警长当选、警徽移交和撕毁仍复用既有公开事件类型，不改变 WebSocket 连接协议；C 端以这些字段更新当前警长。猎人内部 AI 输出为 `{ targetSeat: number | null, reason?: string | null }`，只有实际开枪时才公开原因。
## 狼人杀内部兼容约定

- 内部兼容修复不改变公开 REST 或 WebSocket 连接协议；玩法扩展可以最小化增加 `GameEvent` 展示类型和序列化快照字段。
- 遗言、猎人和警徽窗口仍使用原公开 action type；`last_words:<actorId>`、`hunter_shot:<actorId>`、`sheriff_badge_disposition:<actorId>` 仅作为服务端 AI task 与 action-window epoch 的内部键。
- `nightResultPublished` 仅属于服务端死亡链检查点，序列化、视角投影和精确回放载荷必须移除。
## 狼人杀赛后共享契约

- `SerializedGameState` 可包含 `mvp`、`mvpVotes`、`mvpVoteTally`、`postgameSpeeches`。
- `GameEventType` 增加公开事件 `mvp-vote`、`mvp-result`；`EventMetadata.phase` 与发言 phase 支持 `postgame`。
- MVP 票型为 `Record<voterId, targetId>`，赛后感言以玩家 ID 为键保存最终播报文本，供实时状态与精确回放复用。
## 狼人杀赛后与技能事件

- `GameEventType` 包含 `mvp-start`，用于 MVP 投票前的主持人开场播报。
- `seer-check`、实际用药的 `witch-action` 和 `hunter-shot` 可携带
  `speech: { playerId, text }`，表示使用该玩家音色播放。
- `hunter-shot` 不再传递公开技能原因；历史快照中的原因字段只做兼容读取。
## Werewolf 12-player expansion

- `SelfDestructPayload` may include `targetId?: number | null` for white wolf king self-destruct target display.
- `PlaybackEvent`/game event consumers should treat `self-destruct` as one shared event semantic for real-time play and history replay.
- This expansion does not change WebSocket start/control/ack message shapes and does not add a public REST API.
- White wolf king death sources such as `self_destruct` and `white_wolf_king_self_destruct` are server workflow semantics; shared payloads only expose fields required by display clients.

## Werewolf first-batch boards

- `GameEventType` includes `hybrid-master`、`silence-result`、`knight-duel` for first-batch werewolf board display.
- `HybridMasterPayload` exposes `hybridMaster: { actorId, masterId }` for scoped hybrid feedback.
- `SilenceResultPayload` exposes `silencedPlayerId` and optional `reason` for the next-day silence display.
- `KnightDuelPayload` exposes `knightDuel: { actorId, targetId, success, targetFaction }` for public duel display.
- `SerializedRound` may contain `silencedPlayerId/silenceReason/knightDuel`; `SerializedPlayer` may contain `hybridMasterId/lastSilencedTarget/knightDuelUsed`.
- These are display/state payload extensions only. WebSocket start/control/ack, REST API routes and database schema are unchanged.

## Werewolf second-batch boards

- `GameEventType` includes `butterfly-hug` and `stalker-assassinate`.
- `ButterflyHugPayload` exposes `butterflyTarget` and optional `reason`.
- `StalkerAssassinatePayload` exposes `stalkerTarget` and optional `reason`.
- `SerializedNight` may include `butterflyTarget/butterflyReason/stalkerTarget/stalkerReason`; `SerializedPlayer` may include `butterflyHugUsed/stalkerAssassinateUsed`.
- These fields are display/state extensions only and do not change REST, WebSocket connection messages or database schema.

## Werewolf third-batch boards

## Werewolf fourth-batch boards

- `SerializedPlayer` may contain `evilKnightTriggered` and `oldRoguePendingDeath`.
- `SerializedRound` may contain `evilKnightTrigger` and `oldRogueDeath`.
- These fields are display/state extensions for `evil-knight-guard-12` and `wolf-beauty-rogue-12`; REST API routes, WebSocket connection messages and database schema are unchanged.

- `GameEventType` includes `wolf-beauty-charm`, `demon-inspect` and `nightmare-fear`.
- `WolfBeautyCharmPayload` exposes `wolfBeautyTarget` and optional `reason`.
- `DemonInspectPayload` exposes `demonInspect: { target, result, reason? }`; this is a scoped/private result and must not be emitted as public audience state.
- `NightmareFearPayload` exposes `nightmareTarget` and optional `reason`.
- `SerializedNight` may include `wolfBeautyTarget/wolfBeautyReason/demonInspect/nightmareTarget/nightmareReason`; `SerializedPlayer` may include `lastNightmareTarget`.
- These fields are display/state extensions only and do not change REST, WebSocket connection messages or database schema.

## Werewolf fifth-batch boards

- `GameEventType` includes `dreamer-dream` and `magician-swap`.
- `DreamerDreamPayload` exposes `dreamerTarget` and optional `reason`.
- `MagicianSwapPayload` exposes `magicianSwap.firstTarget/secondTarget` and optional `reason`.
- `SerializedNight` may include `dreamerTarget/dreamerReason/dreamerRepeatedTarget` and `magicianSwap`; `SerializedPlayer` may include `magicianSwappedIds`.
- These fields are display/state extensions for `wolf-king-dreamer-12` and `wolf-king-magician-12`; REST API routes, WebSocket connection messages and database schema are unchanged.

## Werewolf sixth-batch boards

- `GameEventType` includes `fortune-teller-mark`, `big-bad-wolf-kill`, `crow-curse` and `bear-tamer-roar`.
- `FortuneTellerMarkPayload` exposes `fortuneTellerMark: { target, reason? }`.
- `BigBadWolfKillPayload` exposes `bigBadWolfTarget` and optional `reason`.
- `CrowCursePayload` exposes `crowCurse: { target, reason? }`.
- `BearTamerRoarPayload` exposes `bearRoar: { roaring, adjacentWolfIds }`.
- `SerializedNight` may include `fortuneTellerMark/bigBadWolfTarget/bigBadWolfReason/crowCurse`; `SerializedRound` may include `bearRoar/crowCursedPlayerId`; `SerializedPlayer` may include `fortuneTellerMarkUsed/bigBadWolfKillUsed/lastCrowTarget`.
- These fields are display/state extensions for modes 14-16; REST API routes, WebSocket connection messages and database schema are unchanged.
## Werewolf seventh-batch snapshot fields

- `SerializedPlayer` now allows `wildChildModelId`, `wildChildTransformed` and `nineTailedFoxTails`.
- `SerializedRound` and C-side `WerewolfRound` now allow `bombmanBlast`.
- These are snapshot/display fields for existing werewolf events and history replay. They do not add a database table, REST route or WebSocket start/control/ack message shape.
# 2026-07-04 狼人杀动物园模式补充

- `GameEventType` 新增 `penguin-freeze`、`fox-inspect`。
- `SerializedPlayer`/客户端 `Player` 新增企鹅与狐狸状态字段：`lastPenguinTarget`、`foxInspectLost`、`foxLastInspect`。
- `SerializedNight`/客户端 `WerewolfNight` 新增 `penguinFrozenId`、`penguinReason`、`foxInspect`。

## 2026-07-04 Black merchant boards

- `GameEventType` includes `black-merchant-gift`, `lucky-seer-check`, `lucky-witch-poison` and `younger-brother-kill`.
- `SerializedNight` may include `blackMerchantGift`, `luckySeerCheck`, `luckyPoisonTarget/luckyPoisonReason` and `youngerBrotherTarget/youngerBrotherReason`.
- `SerializedPlayer` and C-side `Player` may include `blackMerchantGiftUsed`, `blackMerchantGift`, `blackMerchantDeathPending`, `bigTreeWolfHits`, `godSkillsDisabled`, `youngerBrotherSoloKillUsedDay` and `wolfElderBrotherDeathDay`.
- Shared channel maps add black merchant, wolf brother, penguin and fox scoped actions. Lucky gifted actions remain public display events because lucky is temporary state, not a static role scope.
- These are snapshot/display extensions only. REST routes, WebSocket connection/control/ack messages and database schema are unchanged.
## 2026-07-04 Werewolf modes 23-24 fields

- Werewolf night snapshots may include `wolfSeedInfect`, `heavenlyEyeCheck`, `requesterPrayer`, `requesterTarget` and `requesterReason`.
- New action ids are `wolf_seed_infect`, `heavenly_eye_check`, `requester_pray` and `requester_kill`; they reuse the existing action-window and action-submitted payload shape.
- REST API, WebSocket start/control/ack envelopes and database schemas are unchanged.

## 2026-07-04 Werewolf modes 25-26 fields

- Werewolf night snapshots may include `thiefChoice`, `loverLink` and `succubusLink`.
- New action ids are `thief_choose`, `cupid_link` and `succubus_link`; they reuse the existing action-window and action-submitted payload shape.
- Player snapshots may include `loverId` and `loverSource` when the server exposes full player state. REST API, WebSocket envelopes and database schemas are unchanged.
## Werewolf Mode 27 Shared Contract

- Shared channel maps now route `ghost_bride_link`, `ghost_bride_chat` and `ghost_bride_kill` to the `ghost_bride` scoped channel.
- The server view policy treats `ghost_bride` scope as visible to the Ghost Bride role before linking and to `third_party` members after linking.
- Client/server event payloads may include `ghostBrideLink`, `ghostBrideChat` and `ghostBrideTarget`.
- Player payloads may include `ghostBridePartnerId`, `ghostBrideWitnessId` and `witnessForGhostBride`.
- No database schema or external API contract changed.

## Werewolf Mode 28 Shared Contract

- `sapling` is a default role id in the werewolf config and is exposed through the existing mode/role config shape.
- Firepower mode does not add a new public event type or WebSocket envelope; Sapling-linked Big Tree death is represented by the existing night/exile/hunter death data.
- `GameEventType` includes `ghost-bride-link`, `ghost-bride-chat` and `ghost-bride-kill` so the existing Ghost Bride workflow events type-check in shared code.
- REST API routes, socket start/control/ack messages and database schemas are unchanged.

## Werewolf Mode 29 Shared Contract

- `GameEventType` includes `escape-hunter-speech`, `escape-hunter-vote`, `escape-hunter-hunt` and `thick-wolf-armor`.
- `channelMaps.ts` routes both Escape Hunter actions and the `escape_hunter` role to `scopeKey: escape_hunters`.
- Serialized night state adds hunter ids, speech order, speeches, choices, tally, target and Thick Wolf armor-break data through the existing game snapshot shape.
- Existing REST schemas, WebSocket envelopes and database schemas are unchanged.

## Werewolf Mode 30 Shared Contract

- `GameEventType` includes `demon-hunter-hunt`.
- Shared channel maps route `demon_hunter_hunt` to the `demon_hunter` scoped channel and map `magic_wolf` to the wolf channel.
- Werewolf night snapshots may include `demonHunterTarget` and `demonHunterReason`.
- Action id `demon_hunter_hunt` reuses the existing action-window and action-submitted payload shape.
- REST API routes, socket start/control/ack messages and database schemas are unchanged.

## Werewolf Mode 31 Shared Contract

- `GameEventType` includes `spirit-wolf-learn`, `spirit-wolf-inspect`, `spirit-wolf-guard` and `spirit-wolf-antidote`.
- Shared channel maps route `spirit_wolf_*` actions to the `spirit_wolf` scoped channel and map role `spirit_wolf` to the wolves channel.
- Werewolf night snapshots may include `spiritWolfLearn`, `spiritWolfInspect`, `spiritWolfGuardTarget`, `spiritWolfGuardReason`, `spiritWolfAntidoteTarget` and `spiritWolfAntidoteReason`.
- Action ids `spirit_wolf_learn`, `spirit_wolf_inspect`, `spirit_wolf_guard` and `spirit_wolf_antidote` reuse the existing action-window and action-submitted payload shape.
- REST API routes, socket start/control/ack messages and database schemas are unchanged.
## Werewolf Mode 32 Shared Types

- Added shared game event types `wolf-witch-curse` and `illusionist-illusion`.
- Added channel mappings: `wolf_witch` actions use the wolves scope; `illusionist` actions use the illusionist scope.
- Client/server night state now includes `wolfWitchCurse`, `illusionTarget`, and `illusionReason`.

## 玩家备选模型契约

- B 端玩家 DTO 新增可空 `fallbackModelId`；服务端数据库行字段为 `fallback_model_id`。
- C 端玩家类型、公开游戏事件、WebSocket 消息和回放契约不增加模型配置字段。
