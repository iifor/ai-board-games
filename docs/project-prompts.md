# 狼人杀提示词系统梳理

## 总览

狼人杀提示词系统运行在服务端，核心目标是让 AI 玩家在每次行动时只看到自己应该看到的信息，并按服务端要求输出文本或结构化 Action。

整体链路：

```txt
werewolf workflow step
  -> 创建 action window / AI task
  -> aiActions 根据 actionType 选择提示词
  -> PromptContextBuilder 组装本次行动上下文
  -> WerewolfAgent / BasePlayerAgent 调用 LLM
  -> role skill 解析 JSON / 文本 / targetSeat
  -> reducer 或 Engine Core 写入状态与事件
  -> trace 记录 LLM 调用、fallback、交互反馈
```

提示词分四类：

- 身份提示词：开局创建 AI 玩家时注入，说明身份、阵营、能力、队友和长期规则。
- 行动提示词：每次行动临时生成，说明当前公开事实、私密信息、合法目标和输出格式。
- 私密反馈提示词：角色行动生效后，给对应玩家补充私密结果，例如预言家查验结果。
- 主持播报文案：服务于 C 端展示和语音播放，不参与 AI 决策和状态结算。

关键边界：

- AI 玩家不能推进流程，不能直接修改游戏状态。
- AI 只能在 ActionWindow 内提交文本、JSON 或目标座位号。
- 服务端必须校验 JSON、合法目标、行动窗口和角色权限。
- 预言家查验、女巫用药、守卫目标、狼人刀口等私密信息只能进入对应角色或阵营 prompt，不能进入 public / audience 播报。

## 核心文件

| 文件 | 职责 |
| --- | --- |
| `packages/server/modules/werewolf/prompts/system.ts` | 构建狼人杀玩家完整 debug system prompt、轻量 system prompt，并保留遗留私密记忆 helper。 |
| `packages/server/modules/werewolf/prompts/context.ts` | 每次行动构造短上下文 Prompt Bundle。 |
| `packages/server/modules/werewolf/prompts/actions.ts` | 定义各类狼人杀 action 的任务提示词和技能描述。 |
| `packages/server/modules/werewolf/prompts/speech.ts` | 封装白天发言、狼人夜聊、警长发言等文本调用。 |
| `packages/server/modules/werewolf/prompts/announcements.ts` | 主持人规则介绍、阶段提示、结果公布等 C 端播报文案。 |
| `packages/server/modules/werewolf/aiActions.ts` | 狼人杀 AI 行动分发入口，根据 `actionType` 调用对应 prompt 和 skill。 |
| `packages/server/modules/werewolf/roles.ts` | 预言家、女巫、守卫、猎人、狼人等角色 skill 的执行逻辑。 |
| `packages/server/modules/werewolf/runtime.ts` | 创建 / 重建狼人杀 runtime agent，并注入 system prompt 和角色 skill。 |
| `packages/server/modules/agent-core/playerAgent.ts` | 通用 AI 玩家调用层，提供短上下文和长上下文 LLM 调用、JSON 解析、目标校验。 |

## 身份提示词

入口：`packages/server/modules/werewolf/prompts/system.ts`

`buildSystemPrompt()` 生成完整开局提示词，主要包含：

- 游戏模式和基础规则。
- 当前玩家座位号、身份、阵营、角色能力。
- 当前玩家需要承担的游戏目标。
- 玩家名单和座位信息。
- 狼人专属队友信息，包括队友座位号、身份和存活状态。
- 玩家人格、语气、发言风格。
- 当前参赛玩家的聚合交手印象；只包含历史公开行为和赛后公开身份，最多约 1200 个中文字符。
- 输出纪律，例如不要复述系统提示、不要编造流程、决策时使用座位号。

完整开局提示词既保存在 `agent.baseSystemPrompt` 用于 debug，也作为玩家会话唯一的开局 system message。后续普通 `ask/askJson/askVoteTarget` 调用复用该会话，不再重复构建或追加完整 system prompt。

`runtime.ts` 中 `createRuntimeAgent()` 会：

1. 调用 `buildSystemPrompt()`。
2. 按 `gameType + matchId + sourcePlayerId` 恢复本局 `memory_snapshots` 会话；没有快照时以完整开局 prompt 创建会话。
3. 注册该角色可用 skill。
4. 不再额外追加开局私有认知、模式/身份摘要或预言家查验 system message；新增事实由每次行动的 `publicFacts/privateKnowledge/recentContext` 动态提供。

`buildLightweightSystemPrompt()` 仅作为兼容 helper 保留，不是狼人杀主调用链的开局 system 来源。

## 私密记忆

入口：`packages/server/modules/werewolf/prompts/system.ts`

当前保留两类私密记忆 helper 作为遗留兼容入口，但狼人杀主 LLM 调用链不再使用它们追加长期 system message：

- `appendOpeningPrivateMemory()`：历史上用于开局身份确认、队友互通和角色能力说明；现主链路改由完整 `baseSystemPrompt` debug 保存和动态 `privateKnowledge` 提供。
- `appendSeerCheckPrivateMemory()`：历史上用于把预言家历史查验结果追加给预言家本人；现主链路由 `buildWerewolfPromptBundle()` 的 `privateKnowledge` 动态注入。

预言家私密查验结果的目标格式应类似：

```txt
【预言家私密查验结果】第1晚，你查验了2号，结果是：好人。
```

这类信息只能进入对应预言家的 prompt 或 trace 调试记录，不能进入 C 端观众展示。

## 动态短上下文

入口：`packages/server/modules/werewolf/prompts/context.ts`

狼人杀当前使用“持久会话 + 动态增量上下文”：开局完整 system message 只写入一次，每次行动临时重建 prompt bundle，并通过普通 `ask/askJson/askVoteTarget` 追加当前任务和结果。会话持久化到 `memory_snapshots`，裁剪时保留开局 system、较早对话摘要和最近 12 组 user/assistant 原始消息。

`buildWerewolfPromptBundle()` 生成：

- `systemRules`：本次行动通用规则。
- `publicFacts`：所有玩家都应该知道的公开事实。
- `privateKnowledge`：当前 actor 才能看到的私密信息。
- `recentContext`：近期关键发言、投票、夜聊和阶段摘要。
- `taskInstruction`：当前 action 的具体任务。
- `outputContract`：输出格式、合法目标、字数限制。

单次 prompt 内必须去重：

- 夜聊记录只出现在 `recentContext` 或任务说明的一处。
- 警上发言只出现在 `recentContext` 或任务说明的一处。
- 可选目标列表只出现在目标列表 / 输出契约的一处。
- 调用方显式传入空 `recentContext` 时，不再自动补默认近期上下文。

渲染入口：

- `renderWerewolfPromptBundle()`
- `buildWerewolfActionPrompt()`

## 公开事实

`publicFacts` 应从完整 `state.rounds` 聚合，而不是只看当前轮次。

应该包含：

- 当前存活玩家名单。
- 当前已出局玩家名单。
- 夜晚死亡结果。
- 白天放逐结果。
- 猎人开枪结果。
- 白痴翻牌结果。
- 警长竞选结果。
- 当前警徽归属。
- 警徽流转。
- 上一轮投票结果和票型。
- 当前阶段和当前天数。

特别注意：

- 白天放逐出局后，后续所有玩家的发言、投票、夜间行动 prompt 都应该知道“谁被放逐出局”。
- 已出局玩家不能出现在后续 `day_vote` 合法目标中。
- 警徽确定后，后续 prompt 和状态投影都应持续携带警长信息，不能只在确定当下出现一次。

## 私密信息

`privateKnowledge` 按角色和阵营隔离。

狼人可见：

- 狼队友座位号。
- 狼队友身份。
- 狼队友存活 / 已出局状态。
- 狼队夜聊摘要。
- 狼队刀口共识。
- 狼队投票过程中的有效目标。

预言家可见：

- 自己每晚查验过谁。
- 每个查验目标的阵营结果：好人 / 狼人。
- 已查验玩家在当前场上的存活状态。

女巫可见：

- 解药是否还在。
- 毒药是否还在。
- 仅在解药未使用且进入 `witch_save` 行动时可见当晚狼刀目标。
- 自己是否选择救人。
- 自己是否选择毒人。

解药已使用后不再创建 `witch_save` prompt。毒药仍在时可以继续创建独立的 `witch_poison` prompt，但该 prompt 不得包含 `wolfTarget`、当晚死亡玩家或可推导刀口的描述；两瓶药均耗尽或女巫已出局时不再发起女巫夜间 LLM 调用。

守卫可见：

- 上一晚守护目标。
- 当前不能连续守护的限制。
- 本晚守护目标。

猎人可见：

- 是否触发开枪窗口。
- 触发原因。
- 合法开枪目标。
- 开枪或不开枪原因可进入 trace/debug，但不要作为公开播报。

非对应角色不能看到这些私密信息。

## 行动提示词

入口：`packages/server/modules/werewolf/prompts/actions.ts`

当前主要 action：

| actionType | 说明 | 输出 |
| --- | --- | --- |
| `wolf_speech` | 狼人夜聊发言 | 文本 |
| `wolf_vote` | 狼队刀口投票 | JSON / `targetSeat` |
| `wolf_kill` | 兼容旧刀口行动 | JSON / `targetSeat` |
| `seer_check` | 预言家查验 | JSON / `targetSeat` |
| `guard_protect` | 守卫守护 | JSON / `targetSeat` |
| `witch_save` | 女巫是否用解药 | JSON |
| `witch_poison` | 女巫是否用毒药 | JSON / `targetSeat` |
| `day_speech` | 白天发言 | 文本 |
| `day_vote` | 白天放逐投票 | JSON / `targetSeat` |
| `sheriff_speech` | 警长竞选发言 | 文本 |
| `sheriff_vote` | 警长投票 | JSON / `targetSeat` |
| `sheriff_handover` | 警徽流转 | JSON / `targetSeat` |
| `hunter_shot` | 猎人开枪 | JSON / `targetSeat` |

输出约束：

- 发言类：自然语言、字数上限、不得复述系统提示、不得直接暴露不该公开的私密信息。
- 投票类：必须只返回标准 JSON 对象，目标必须使用座位号。
- 目标选择类：prompt 必须显式列出可选座位号；没有合法目标时服务端跳过 LLM 并返回保守结果。
- 角色决策类：必须遵守合法目标列表和角色能力限制。
- 夜间决策 reason：预言家查验、女巫非自救用解药、女巫用毒药、猎人开枪都必须返回简短原因；reason 只用于 trace/debug，不作为 C 端公开播报。

标准 JSON 示例：

```json
{"targetSeat":2,"reason":"发言位置可疑，优先确认身份"}
```

不行动示例：

```json
{"targetSeat":null,"reason":"暂无明确目标，选择不开枪"}
```

## 发言提示词

入口：`packages/server/modules/werewolf/prompts/speech.ts`

主要方法：

- `askSpeech()`：通用发言。
- `askWolfNightSpeech()`：狼人夜聊。
- `askSheriffSpeech()`：警长相关发言。

这些方法支持：

- `promptOverride`：由动态 PromptContext 生成完整提示词后覆盖默认提示。
- `stateless`：兼容一次性短上下文调用；狼人杀主流程不使用。
- `thinking`：如果玩家和模型配置支持，会记录思考内容。

狼人杀主流程使用持久会话；动态 prompt 只提供当前任务、合法目标、本轮新增公开记录和新增私密事实，避免重复发送完整历史。

## Agent 调用方式

入口：`packages/server/modules/agent-core/playerAgent.ts`

狼人杀主流程优先使用：

- `askText()`
- `askJson()`
- `askVoteTarget()`
- `askTextWithThinking()`

原因：

- 完整开局规则、玩家名单和身份信息只发送一次。
- 玩家可以保留本局连续对话记忆。
- 每次行动仍重新计算公开事实、私密信息和合法目标，不依赖旧 prompt 作为权威状态。
- 会话按 match 和稳定玩家 ID 隔离，并通过裁剪控制长度。

兼容保留的一次性方法：

- `askTextOnce()`
- `askJsonOnce()`
- `askVoteTargetOnce()`
- `askTextWithThinkingOnce()`

## 主持播报文案

入口：`packages/server/modules/werewolf/prompts/announcements.ts`

包括：

- 规则介绍。
- 天黑 / 天亮。
- 狼人睁眼、预言家睁眼、女巫睁眼、守卫睁眼。
- 行动请求提示。
- 阶段结束提示。
- 夜晚结果公布。
- 警长竞选、警长投票、警徽结果。
- 白天放逐结果。

这类文案只服务 C 端播放体验，不应该作为 AI 决策事实来源。AI 决策事实必须来自 `state.rounds`、action result、DomainEvent 或 workflow projection。

## Trace 观测

排查“AI 是否知道某个信息”时，应看三处：

1. LLM 调用 messages：确认本次 prompt 里有没有该信息。
2. `werewolf_interaction_feedback`：确认角色交互反馈有没有写入 trace。
3. 后续行动 prompt：确认 `privateKnowledge` 或 `publicFacts` 有没有同步该信息。

重点 trace 类型：

- LLM call：记录完整 messages、模型响应、thinking、token、耗时。
- fallback：记录 `invalid-json`、`invalid-target`、`missing-api-key`。
- skill decision：记录 skillId、actor、结果。
- `werewolf_interaction_feedback`：记录预言家查验、女巫用药、守卫守护、猎人开枪等反馈。

Trace 详情同时保存本局参与者快照，使用
`seatId/sourcePlayerId/nickname` 区分游戏座位号与玩家资源主键。管理端不得用
`seatId` 直接查询全局玩家表昵称。旧 Trace 优先从关联 match 状态恢复该映射，
无法恢复时再使用 LLM 与 Agent 决策记录中的座位号并集。

白天发言的 `recentContext` 必须包含已完成的警上竞选发言、警长复投发言和当前
白天已公开发言。调用方显式传入该上下文，避免构建后未写入 Prompt Bundle。

示例：预言家查验后，trace 应同时能看到：

- `werewolf_interaction_feedback`：`seer_check`、actor、target、result、channel、scopeKey。
- 下一次预言家 LLM prompt：`privateKnowledge` 中包含“你查验了 X 号，结果是好人 / 狼人”。

## 当前需要重点防回归的问题

- 预言家查验结果必须反馈给预言家本人，但不能给 C 端观众公开。
- 狼人队友信息必须给狼人互通，并标识队友存活 / 已出局状态。
- 玩家会话只能有一条完整开局 system prompt；runtime 恢复时不能重复追加。
- 白天放逐结果必须同步给所有后续行动 prompt。
- 警徽信息不能只在确认时出现，后续 prompt 和展示状态都要保留。
- 投票结果应进入公开事实，后续发言和投票 prompt 应能引用。
- 最近一次已完成的白天放逐投票属于持续公开事实。进入下一天后，所有合法玩家的后续 prompt 仍需列出每位投票玩家的目标；`null` 目标明确显示为“X号弃票”，并按投票玩家座位号排序。
- 已出局玩家不能进入合法目标列表。
- 私密角色结果不能出现在 public `werewolf_phase_result` 或 audience display event 中。
- 私密夜间行动 reason 不能进入 public/audience display event。
- 同一份 prompt 内不能重复塞入完整夜聊记录或警上发言记录。
- 猎人开枪只输出目标，不要求 `reason`；技能原因由猎人此前遗言自行表达。

## 后续优化建议

1. 给 `buildWerewolfPromptBundle()` 增加单元测试，覆盖公开事实、私密信息、合法目标和输出契约。
2. 给每个 action 建一份 prompt 快照测试，确保 prompt 变化可审查。
3. 在 TraceExplorer 增加“Prompt Bundle 视图”，按 `systemRules / publicFacts / privateKnowledge / taskInstruction / outputContract` 展示。
4. 将 `actionType -> PromptBundle -> session call -> DomainAction` 固化为狼人杀标准链路。
5. 对所有私密信息增加 invariant：不得进入 public event、audience display event 或 C 端 socket。

## 狼人杀提示词可见性与动作契约

- 狼队夜聊、狼队策略和刀口信息只进入狼人 actor 的 `privateKnowledge` 或 `recentContext`，普通玩家的发言、投票和角色行动 prompt 不得包含这些内容。
- 公开死亡事实只公布死亡座位。狼人袭击、女巫毒杀等夜间死亡原因属于结算私密信息，不进入 `publicFacts`，已出局玩家列表也不附带 `deathReason`。
- `publicFacts` 使用死亡、放逐、自爆、警长和票型等结构化字段生成，不再直接拼接 `publicSummary`，避免同一事实以中英文摘要和结构化字段重复出现。
- 显式传入 `recentContext` 时完全覆盖默认近期上下文，包括显式传入空字符串的情况。
- 狼人空刀、狼队弃票、白天弃票、警长弃票和守卫空守均使用 `{"targetSeat":null}`。猎人不开枪沿用可空目标语义；预言家查验必须返回合法的非空目标。
- `guard_protect` 的 Engine Core payload 允许目标为空；空守通过 schema 校验，但不创建 `protect` effect。
- 每次结构化 LLM 调用只保留一份输出契约和一份合法目标列表。`taskInstruction` 只描述任务，`outputContract` 负责 JSON schema、示例和合法目标。
- 当 action prompt 已由 `buildWerewolfPromptBundle()` 提供完整契约时，调用方必须设置 `promptHasContract`，避免 `BasePlayerAgent` 再次追加通用 JSON-only 文案或目标列表。
- `witch_poison` 使用毒药时必须返回简短 `reason`。该原因只允许进入女巫或上帝视角的私密完成事件；缺失时播报“女巫毒了 X 号”。未使用时只展示“女巫没有使用毒药/不毒”，不得生成旁白或 TTS。
- `witch_save` 的刀口上下文仅在解药可用时生成；解药耗尽、平安夜或女巫不可行动时对应 step 静默跳过，不生成替代 prompt。
- `sheriff_badge_disposition` 允许死亡警长作为 actor，输出 `{"action":"transfer","target":座位号,"reason":"..."}` 或 `{"action":"tear","target":null,"reason":"..."}`；输出非法或调用失败时由规则层撕毁警徽。
- `sheriff_speech_direction` 由当前存活警长执行，输出 `{"direction":"clockwise|counterclockwise","reason":"简短原因"}`。非法输出或调用失败时由规则层随机选择方向；警长固定最后发言。
- `last_words` 允许已死亡玩家作为 actor，使用一次性自然语言发言 prompt，不要求 JSON。服务端负责首夜/放逐资格和顺序，prompt 不得让模型自行判断自己是否有遗言权。
- `postgame_speech` 使用结构化决定：发言返回 `{"speak":true,"text":"..."}`，跳过返回 `{"speak":false,"text":null}`。模型调用失败、非法 JSON、空文本均按跳过处理，不生成兜底感言。
