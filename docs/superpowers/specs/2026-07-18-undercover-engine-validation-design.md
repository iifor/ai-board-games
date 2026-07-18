# AI 谁是卧底引擎接入验证设计

## 目标

用“AI 谁是卧底”作为第三款游戏，验证 CONSENSUS 是否已经具备“AI 多角色、回合制、语言交互驱动的社交游戏引擎”能力。

本次成功标准不是单纯完成一个新玩法，而是证明新游戏可以通过既有 `GameDefinition`、工作流、Agent、WebSocket、播放、TTS、ACK、保存、回放和 Trace 管线完成最小完整纵切。新增游戏不得迫使通用运行层增加新的 `gameType === 'undercover'` 专用流程。

## 范围

首版固定支持：

- 6 名 AI 玩家。
- 1 名卧底和 5 名平民。
- 服务端代码内置词对。
- 依次发言、全员私密投票、平票复投、淘汰和胜负判断。
- C 端实时展示、TTS/ACK、暂停、继续、历史保存与回放。
- Trace 记录 LLM 调用、非法输出、秘密词泄漏和 fallback。
- Debug 模式固定词对、卧底和随机种子。

本次不包含：

- 后台词库管理。
- 真人玩家参与。
- JSON/YAML 规则 DSL。
- 动态第三方插件加载或插件市场。
- 通用棋盘、卡牌、资源经济和实时动作能力。
- 独立数据库表、独立 WebSocket 协议或专用回放器。

## 架构决策

### 复用现有 GameDefinition

不新增与 `GameDefinition` 平行的 `GamePlugin` 抽象。卧底通过现有 `GameDefinitionRegistry` 注册，并使用 `GameDefinition.runtime` 作为通用运行入口。

服务端执行链路为：

```text
gameType
  -> GameDefinitionRegistry
  -> definition.runtime
  -> GameEngine.runGame()
  -> onEvent
  -> PlaybackPipeline
  -> WebSocket / TTS / ACK
```

辩论赛和狼人杀保留现有兼容 runner，避免本次验证重写成熟流程。`game-socket` 对其他已注册且提供 runtime 的游戏走 `GameEngine.runGame()`，因此接入第四款同类游戏时不再增加 runner 分支。

### 通用层最小调整

- `normalizeGameType()` 改为查询已注册 definition；未注册类型明确报错，不能回退为狼人杀。
- `getRunner()` 保留 debate/werewolf 兼容入口，其他游戏从 definition runtime 解析。
- PlaybackPipeline 默认对已注册游戏可用，不再只允许 debate/werewolf。
- definition metadata 增加类型化的开始文案、结束文案和播放参数。
- replay 继续消费保存的 playback events，不从包含秘密的原始状态重建公开事件。

### 模块边界

服务端新增 `packages/server/modules/undercover/`：

- `definition.ts`：GameDefinition、runtime 和展示元数据。
- `workflow.ts`：注册持久化工作流和步骤。
- `handlers.ts`：发言、投票、淘汰和胜负推进。
- `rules.ts`：纯函数规则、合法目标、票型、平票和胜负判断；首版词对常量也放在此处。
- `prompts.ts`：身份初始化、发言和投票 Prompt。
- `presentation.ts`：工作流事件到公共展示/播报事件的投影。
- `types.ts`：模块内部状态和依赖类型。
- `index.ts`：稳定出口。

共享层新增：

- `packages/shared/types/undercover.ts`：对局状态、公开玩家、发言、票型、淘汰和结果类型。
- `packages/shared/schemas/undercover.ts`：开局参数、AI 发言和投票输出校验。

C 端新增 `packages/client/src/features/undercover/`：

- `UndercoverGame/index.tsx`：页面组合。
- `components/UndercoverArena.tsx`：六席圆桌、发言、投票和揭晓。
- `components/UndercoverControls.tsx`：复用现有会话控制能力。
- `hooks/useUndercoverGame.ts`：事件投影、实时/回放会话和 UI 状态。
- `types.ts`、`index.ts`：前端局部类型和出口。

单文件继续遵守项目行数和职责限制。

## 玩法状态机

```text
初始化
  -> 第 N 轮开始
  -> 存活玩家依次发言
  -> 全员私密投票
  -> 公布投票结果
  -> 平票复投或淘汰
  -> 胜负判断
      -> 未结束：下一轮
      -> 已结束：身份和词语揭晓
```

### 初始化

- 必须提供 6 个不重复、可用的 AI 玩家 ID。
- 服务端选择一组相近词和一名卧底，并立即把词对、卧底 ID 和随机种子写入持久化状态。
- 每个 AI 只收到自己的词，不被告知自己是否为卧底。
- C 端开局事件只包含公开玩家，不包含两个词或卧底 ID。

### 发言

每轮更换首位发言者。AI 获得自己的词、存活玩家、已公开发言、本轮任务和输出契约，返回：

```ts
{ speech: string }
```

发言约束：

- 最长约 120 字。
- 不得直接包含自己的秘密词。
- 不得访问其他玩家词语或真实身份。
- 服务端发现秘密词直出时重试一次；再次失败则使用安全中性发言。
- 泄漏文本只进入私密 Trace，不进入公共事件或 playback events。

### 投票

所有存活玩家在本轮发言完成后同时决策：

```ts
{ targetId: number; reason: string }
```

- 不允许自投或投已淘汰玩家。
- 投票收齐前不公开任何选择。
- `reason` 仅进入 Trace，不公开播报。
- 非法目标重试一次；再次失败则使用持久化随机种子从合法目标中选择。

### 平票与胜负

- 首次平票：仅保留最高票候选，由所有存活玩家复投。
- 再次平票：按持久化随机种子在最高票候选中稳定抽签淘汰。
- 卧底被淘汰：平民立即获胜。
- 卧底仍存活且场上剩余 3 人：卧底获胜。
- 否则进入下一轮。

对局最多发生三轮淘汰，因此工作流有界。

## 信息可见性

| 数据 | AI 玩家 | C 端观众 | Trace/服务端 |
| --- | --- | --- | --- |
| 自己的词 | 仅本人 | 否 | 是 |
| 其他人的词 | 否 | 否 | 是 |
| 卧底身份 | 否 | 否 | 是 |
| 公开发言 | 是 | 是 | 是 |
| 未完成投票 | 否 | 否 | 是 |
| 投票结果 | 是 | 是 | 是 |
| 结束后的身份和词语 | 是 | 是 | 是 |

游戏结束前，任何 public/audience 事件都不得包含两个秘密词或 `undercoverPlayerId`。历史回放只播放保存的公开 playback events。

## 展示事件

首版事件保持最小集合：

- `undercover-game-start`
- `undercover-round-start`
- `undercover-speech`
- `undercover-vote-start`
- `undercover-vote-result`
- `undercover-eliminated`
- `undercover-game-result`

发言、轮次、淘汰和结果事件进入现有 TTS/ACK。单个私密投票不播放，收齐后才发布票型和统一结果。

## C 端体验

游戏选择页增加“AI 谁是卧底”卡片，固定选择 6 人。对局页面提供：

- 六个圆桌席位和当前发言者高亮。
- 已淘汰玩家置灰并显示淘汰轮次。
- 中央轮次、阶段和主持文案。
- 按时间排列的发言记录。
- 投票完成后的统一票型。
- 结束时统一翻牌，展示平民词、卧底词和卧底玩家。
- 返回、暂停、继续、语音开关和回放跳过。

游戏结束前不显示身份或词语；状态同时使用文字/图标表达，不能只依赖颜色。

卧底只实现一个 C 端页面，不复制 v1/v2 两套组件。历史回放打开相同页面并消费已保存事件。

## 错误处理

- 玩家数量不是 6、ID 重复或玩家不可用：拒绝开局。
- 词库为空：拒绝开局，不返回假成功。
- LLM 超时、非法 JSON、非法目标和秘密词泄漏：重试一次后使用安全 fallback。
- 保存对局失败：会话不能报告成功。
- WebSocket 断开或取消：停止后续调度并释放现有 session lease。
- Debug 模式允许固定词对、卧底和随机种子，确保问题可复现。

## 文件变更范围

预计修改：

- `packages/shared/types/gameTypes.ts`：加入 `undercover`。
- `packages/shared/types/gameEngine.ts`：类型化 session/playback metadata。
- `packages/server/modules/engine-registry.ts`：注册卧底 definition/workflow。
- `packages/server/modules/game-socket/service.ts`：registry 校验、通用 runtime 和通用播放路径。
- `packages/client/src/App.tsx`：组合卧底路由。
- `packages/client/src/pages/GameSelectPage/index.tsx`：第三款游戏和固定 6 人规则。
- `packages/client/src/services/gameService.ts`：现有 start payload 已使用通用 `gameType`，本次不修改。
- 历史列表和后台游戏类型标签：识别 `undercover`。
- `docs/project-summary.md`、`docs/project-workflow.md`、`docs/project-client.md`、`docs/project-shared.md`：同步契约。

预计不删除文件，不修改数据库 schema，不新增 REST 路由或 WebSocket 消息类型。

## 测试与验收

### 纯规则

- 初始化恰好一个卧底。
- 卧底淘汰后平民获胜。
- 卧底存活至 3 人时获胜。
- 首次平票触发复投，二次平票稳定抽签。
- 自投和投已淘汰玩家被拒绝。

### 信息隔离

- 结束前公共事件不包含两个秘密词或卧底 ID。
- 每个 AI Prompt 只包含自己的词。
- 泄漏词语的发言不会进入公共事件。
- 结束事件包含完整揭晓数据。

### 完整工作流

使用固定 AI 响应运行：

- 一局平民胜利。
- 一局卧底胜利。
- 一局包含二次平票。
- 最终 match 状态为 `completed`。
- 状态、事件和结果可从快照恢复。

### 引擎契约

- `undercover@1.0.0` 可通过 registry 查询。
- 未注册游戏明确拒绝，不回退狼人杀。
- 卧底通过通用 runtime 运行，不新增专用 socket runner 分支。
- 通用播放管线捕获卧底事件。
- 保存的 playback events 按原顺序回放。
- 一个最小模拟 definition 可以走相同通用入口，证明第四款游戏无需修改服务端通用运行层。

### 验证命令

```powershell
pnpm.cmd run check
pnpm.cmd run test:unit
pnpm.cmd run test:workflow
pnpm.cmd run build
```

如果全量测试在业务断言前遇到依赖链接问题，先区分环境阻塞与业务回归，再运行定向验证；未实际运行的检查不得报告为通过。

## 完成定义

本次完成必须同时满足：

1. C 端可以选择 6 名 AI 并完成一局实时谁是卧底。
2. TTS/ACK、暂停/继续、保存、历史回放和 Trace 贯通。
3. 游戏结束前没有秘密词或卧底身份泄漏到公共事件。
4. 卧底通过注册 definition 和通用 runtime 接入，`game-socket` 不增加卧底专用 runner 分支。
5. 规则、工作流、可见性和引擎契约测试通过。
6. 对应项目文档同步更新。
