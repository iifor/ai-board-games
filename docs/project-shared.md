# 共享类型、Schema 与测试

## 项目概述

共享包位于 `packages/shared`，用于沉淀前后端共同依赖的类型、schema、常量、工具和 Vite 插件，减少 API、WebSocket、游戏状态和工作流协议漂移。

## 技术栈

- TypeScript
- zod
- pnpm workspace exports

## 目录结构

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
│   ├── skillRegistry.ts
│   └── workflowSchemas.ts
├── types/
│   ├── apiTypes.ts
│   ├── channelTypes.ts
│   ├── gameEngine.ts
│   ├── gameEvent.ts
│   ├── gameTypes.ts
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

### Schema

- `gameSchemas.ts`：游戏参数校验 schema。
- `workflowSchemas.ts`：工作流参数校验 schema。
- `gameEngineSchemas.ts`：游戏引擎 schema，校验 definition、action、effect、event、channel policy 和可选 `projectState`。
- `skillRegistry.ts`：技能注册相关 schema。

### 通用 Game Engine 类型

`packages/shared/types/gameEngine.ts` 是 `packages/server/modules/game-engine` 的共享 contract：

- `GameDefinition`：游戏接入点，声明 `gameType`、`version`、`workflowId`、action schema、effect resolver、channel policy 和可选 `projectState`。
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
- `tests/workflow`：工作流测试，例如狼人杀 reducer/effects/action window、事件投影、辩论发言事件、展示事件。
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
- `HunterShotPayload`：`shot: { from, target }` 和可选公开 `reason`。

这些类型描述展示事件字段，不改变 REST API 或 WebSocket 连接协议。

神职 `reason` 是可选的简短决策说明，服务端清理首尾空白并最多保留 80 字。原因仅在行动合法且实际生效时进入状态与展示载荷；不得使用 thinking 代替原因，也不得因缺少原因判定输出失败。

狼人杀新增内部行动 `sheriff_speech_direction`，结果为 `{ direction: 'clockwise' | 'counterclockwise', reason?: string }`。狼人击杀胜利锁定属于服务端 round 内部状态，不属于共享展示协议，也不得写入回放播放载荷。

女巫药品耗尽和角色不可行动产生的 `action-skipped` 属于 `channel: system` 的内部审计事件，不进入共享播放事件或 C 端回放载荷。`usedAntidote/usedPoison` 仍是服务端判断药品库存的状态来源。

展示事件的 `presentation.requiresAck` 用于区分需要等待语音播放的事件与纯 UI 状态事件。女巫“不毒”的 `witch-action` 设置 `requiresAck: false`、空 `speakableText` 和 `suppressSpeech: true`，事件仍进入 `PlaybackEvent` 持久化，但不注入连接态 `ackId`。

`last_words` 是服务端内部死亡行动，允许已死亡玩家作为 actor；公开协议继续使用既有 `last-words`、`exile-words`。内部 `pendingLastWords` 和 `winnerLock` 不属于共享快照或回放载荷。狼人杀模式 `winCondition` 的正式值为 `side/gods/villagers/all`，旧 `single` 仅作为输入兼容并归一化为 `side`。

`SheriffEventPayload` 可选携带 `sheriffId/sheriffBadge`。警长当选、警徽移交和撕毁仍复用既有公开事件类型，不改变 WebSocket 连接协议；C 端以这些字段更新当前警长。猎人内部 AI 输出为 `{ targetSeat: number | null, reason?: string | null }`，只有实际开枪时才公开原因。
## 狼人杀内部兼容约定

- 本次修复不改变公开 REST、WebSocket 或 `GameEvent` 类型。
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
