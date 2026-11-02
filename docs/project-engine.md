# 引擎（packages/engine）

> 状态：P1 完成引擎核心并接入辩论赛；P2 加入阶段栈、触发器、终局转入、发言附加动作、加权投票、可放弃动作与公开身份，并接入狼人杀标准局；P7 加入玩法变体、阶段开关、座位改派、投票额外票与改换阵营后的频道可见范围，以及按局发牌（`setup.deal`）。

## 职责与边界

- 定义 `GameSpec` 与编写 API，编译期校验 spec。
- 纯函数解释器 `advance(game, snapshot, input)`：推进流程，产出日志、舞台事件与 AI 请求。
- 七种基础动作、提示词分层组装、可见性过滤、输出校验与兜底、调试断点与脚本化输出。
- 内存测试夹具与性质检查（`@battle/engine/testing`，只供测试使用）。
- **不做任何 IO**：不访问数据库、网络、文件、时钟；随机数只用种子 RNG。约束方式见 `project-summary.md` 的"纯度约束"。
- 只依赖 `zod` 与 `@battle/shared`；游戏只能通过 `@battle/engine` 公开 API 编写。

## 使用方式（服务端视角）

```ts
const game = gameRegistry.get('debate');                     // 已编译的 CompiledGame
let snapshot = createSnapshot(game, { seed, players, params }); // status: created
let r = advance(game, snapshot, { kind: 'start' });
// 保存 r.snapshot；把 r.stageEvents 推给前端；把 r.aiRequests 交给 AI worker
r = advance(game, r.snapshot, { kind: 'ai_result', requestId, output });   // 模型原始输出（已解析的 JSON）
r = advance(game, r.snapshot, { kind: 'ai_failed', requestId, reason });   // 传输层重试后仍失败
r = advance(game, r.snapshot, { kind: 'debug', command: 'step' });         // 仅调试局
```

- `advance` 不修改传入的快照；快照可 JSON 序列化，服务端整体存取即可。
- 状态：`created → running → waiting_ai ⇄ running → completed`；调试局还会进入 `paused`。
- 非法输入（重复开局、未知或过期的请求、非调试局的调试指令）抛 `EngineInputError`，调用方保留原快照。
- spec 写错抛 `SpecError`（编译期汇总全部问题），或在运行到出错位置时抛出普通 `Error`。
- 快照记录 `specHash`；用不匹配的游戏定义推进抛 `SpecMismatchError`（不继承 `EngineInputError`：这一局用当前代码永远无法推进，调用方必须单独处理，不能当成过期输入忽略）。hash 覆盖结构、模板与函数源码，所以改动任何规则、模板都会让进行中的旧对局无法继续。**hash 不覆盖闭包捕获的常量**，改变行为时必须同时提升 `version`。
- `AiRequest.prompt` 是 L1–L6 分层结果，`toChatMessages()` 给出推荐的消息排布（L1–L3 为 system，L4–L6 为 user）。
- 调试局用 `scriptedOutput(game, snapshot, request)` 生成确定性合法输出，代替真实模型。

## 编写一个游戏

每个游戏放在 `packages/games/src/<key>/`：`state.ts`（schema 与类型）、`prompts.ts`（`definePrompts`）、`rules.ts`（纯函数）、`spec.ts`（`defineGame` + `compileGame`）、`*.test.ts`，并在 `packages/games/src/index.ts` 注册。

GameSpec 关键字段：

| 字段 | 说明 |
| --- | --- |
| `players` | 人数范围 |
| `params` | 开局参数 schema（可选）；不提供时只接受空参数 |
| `prompts` | 本游戏全部模板；规则、身份、阶段、发言轮次覆盖用的模板都必须登记在这里 |
| `rulesText` / `roles[*].identity` | L2 / L3 模板 |
| `roles` | `name`、`team`、`positions`（席位数）、`publicRole`（所有人可见）、`knowsTeammates`（知道队友身份） |
| `seatLabel` | 座位称呼，用于日志与提示词，默认 `3号 张三` |
| `setup` | `assign`（角色 → 数量，最多一个 `rest`）、`shuffle`（默认 true）、`deal`（可选：按局决定实际发出的角色，如盗贼板子开局先抽走两张底牌；拿到默认分配、人数、变体与独立的种子随机数，返回的分配必须只含已定义角色且合计等于人数，否则抛 `SpecError`）、`init`（初始状态） |
| `variants` / `defaultVariant` | 玩法变体（如狼人杀板子）：`name`、`description`、`assign`（替换角色分配）、`players`、`config`（规则通过 `ctx.variant.config` 读取，由游戏自行校验）；开局输入 `variant` 选择，缺省取 `defaultVariant` |
| `state` | `schema` 决定状态类型；`visibility` 声明每个字段对 AI 的可见性，**未声明即不可见** |
| `start` / `phases` | 阶段字典；`end` 是保留的终局目标 |
| `end` | 胜者判定，返回 `winner`、`winnerLabel`、`summary`、`mvp` |
| `triggers` | 事件触发器，见下文"阶段栈与触发器" |
| `gameOver` | `{ when, goto }`：阶段完成后检查，但只在主流程上（阶段栈为空）且没有排队的触发器链时判定——已触发的出局连锁（遗言、开枪……）先全部结算，开枪带走狼人可以推翻票数判定；命中时转入 `goto`（赛后环节或 `end`），只触发一次 |
| `budget` | `maxRounds`、`maxPhaseVisits`（默认 100）、`maxAiRequests`（默认 1000）、`maxStackDepth`（默认 8）；超限按 `endReason: 'budget'` 终局 |
| `presentation` | `layout`、`audienceView`（默认 public）、`areas`、`revealOnEnd`、`view`（观众视图附加数据，作者负责只放公开信息） |
| `debug` | 默认断点、调试发言内容 |

类型推断：`S` 只由 `state.schema` 决定，`P` 只由 `params` 决定（`init`、`apply`、`compute` 的返回值用 `NoInfer` 排除在推断之外）。所有回调都用方法语法声明，规则函数可以独立写在 `rules.ts` 中，参数类型为 `RuleContext<State, Params>`。

### 规则上下文 `ctx`

`state`、`params`（深度冻结）、`seats`（`SeatQuery`：`alive`、`dead`、`withRole`、`inTeam`、`position`、`except`、`where`、`get`、`ids`、`count`）、`round`、`phaseId`、`results`（各阶段最近一次结果，配合 `expectResult` / `findResult` 读取）、`result`（当前阶段结果，仅在 `next` / `apply` 中有值）、`endReason`、`random(label)`（由种子、阶段、访问次数与标签派生）、`trigger`（由触发器进入的阶段链中，触发它的事件）、`variant`（本局变体 `{ key, name, config }`，游戏没有变体时为 null）。

### 基础动作

| kind | 行为 | AI 输出 |
| --- | --- | --- |
| `announce` | 用**公开上下文**渲染模板，写入主持播报 | — |
| `speak` | `actors` 返回座位或 `SpeakTurn[]`（每轮可覆盖模板并带 `turn.*` 变量）；`sequential`（默认，后发言者能看到前面的发言）或 `parallel`；`validate` 做内容校验；`channel` 决定频道（默认 public）；`declarations` 允许有权的座位在发言时附带声明（如自爆） | `output` schema（标准为 `speechOutput({ max })`：`max` 是提示词告诉模型的目标字数，引擎把它注入为轮次变量 `turn.maxChars`，模板写"不超过 {{turn.maxChars}} 字"而不手写数字；schema 的硬上限是它的 `SPEECH_LENGTH_TOLERANCE`（2）倍，略超目标的发言照常采用，超过硬上限才重试、兜底；自定义 `output` schema 没有登记字数时 `turn.maxChars` 取 `DEFAULT_SPEECH_MAX_CHARS`（150））；有权声明的座位额外获得可选的 `declare` 字段 |
| `act` | 每个 actor 在 `targets` 中选 `count` 个；`allowNone` 允许输出空数组放弃（兜底默认放弃）；日志默认写入该座位私密频道；`apply` 把全部决定写回状态 | 自动生成 `{ targets, reason? }`，座位号接受 `3` 或 `"3"`（见"AI 管线"） |
| `vote` | 投票后计票，`weight` 设定票权，`bonus` 给出不属于任何投票者的额外票（如乌鸦诅咒，进入阶段时计算一次，每轮只计给该轮候选人；日志的 `tally` 含额外票、`ballots` 不含，AI 历史中显示为"额外票：5号+1"），`allowAbstain` 允许弃票（`fallbackMode: 'abstain'` 时兜底为弃票）；平票在并列者中复投 `tie.runoff` 次，仍平票按 `tie.then`（`seeded_random` / `none`），结果中的 `tied` 给出最终并列者、`ballots` 给出最后一轮的有效选票（不含弃票，规则可据此知道谁投了谁）；`onResult: 'eliminate'` 淘汰当选者（`eliminateCause` 为触发器用的原因）；`apply` 写回状态 | 自动生成 `{ target, reason? }`，允许弃票时 `target` 可为 null；座位号接受 `3` 或 `"3"` |
| `judge` | 评委依次判定，`verdicts` 定义选项与含义；多数决，无评委或并列时取 `tieVerdict`；`commentMax`（默认 300）是点评字数上限 | 自动生成 `{ verdict, comment }`，选项含义写入 schema 描述；`commentMax` 同样注入为 `turn.maxChars`，模板用它说明点评字数 |
| `compute` | 纯函数结算：返回新状态、`reassign`（改变座位的角色或阵营；阵营改变时座位记录 `teamSince`，见"可见性"）、日志、淘汰列表，按此顺序生效（播报先于出局事件） | — |
| `reveal` | 写入一条揭示日志；`revealRoles` 向所有玩家与观众公开全部身份，并在日志 `data.roles` 中给出身份表 | — |

阶段可声明 `enabled(ctx)`：返回 false 时静默跳过（不记录、不计访问次数），直接按 `next` 跳转（此时 `ctx.result` 为 null），用于本局不存在的角色。跳过的阶段**不保留上一次访问的结果**：`ctx.results[phaseId]` 会被删掉，后续的 `when`、模板与 `findResult` 不会读到上一轮的数据（调试指令 `skip` 同样如此）。

跳转：`next` 为阶段 ID、`end`、`return`，或 `{ when?, goto, round? }` 列表（按顺序取第一个命中项，最后一项必须无条件）；`round: 'increment'` 使轮次加一。编译期检查跳转目标存在、所有阶段可达（从 `start`、触发器目标、`gameOver.goto` 出发），且只有触发器插入的阶段链可以 `return`。

### 阶段栈与触发器

- 事件：`seat_eliminated`（`seat`、`cause`、`reason`，任何淘汰都会派发）与 `action_declared`（`seat`、`action`，来自发言声明）。
- 触发器 `{ id, on, when?(ctx, event), push | jump, round? }` 按声明顺序匹配。
- `push`：排入队列，等主流程上的当前阶段完成后插入；原本要去的目标（含轮次加一）压入阶段栈，插入链末尾 `return` 时再继续前往。队列只在主流程（阶段栈为空）上被消费：一条链内部的转换（如开枪 → 结算）不会被别的触发器插队，链 `return` 后才按排队顺序执行下一条。插入链中再触发的事件同样排队，所以遗言、开枪、被枪杀者的遗言会按触发顺序串起来。
- `jump`：立即中止当前阶段（作废其未完成的 AI 请求），清空阶段栈与队列后跳转，可附带轮次加一。
- 插入链中的阶段通过 `ctx.trigger` 读取触发事件（如出局者座位）。
- 胜负判定（`gameOver.when`）只在主流程上、队列为空时进行：插入链 `return` 回到主流程且没有排队的链之后才判定，所以天亮出局的猎人一定先开枪，被放逐的最后一头狼也仍有遗言。`gameOver` 命中后不再派发任何触发器。

## 提示词分层

| 层 | 来源 |
| --- | --- |
| L1 平台契约 | 引擎内置 |
| L2 游戏规则 | `rulesText` |
| L3 身份 | 角色 `identity` + 玩家人设 |
| L4 可见历史 | 按该玩家可见频道过滤的日志（可见性先于压缩）。最近 2 轮（含当前轮）完整保留；更早的轮次只留播报、投票、出局、揭示等结构性记录，发言正文（公开发言、队内密谈、遗言）合并为一条“（第 N 轮的 K 条发言已省略）”放在该轮第一条发言的位置；压缩后仍超过 400 行时只保留最近 400 行（`prompt/history.ts`、`prompt/historyCompression.ts`） |
| L5 阶段指令 | 阶段或发言轮次的模板 |
| L6 输出契约 | 由输出 schema 生成的 JSON Schema、合法目标、上一次的错误原因 |

模板语法只有 `{{path}}`、`{{#each path}}…{{/each}}`（块内用 `this.x`）、`{{#if path}}…{{else}}…{{/if}}`；变量缺失或输出非标量会报错，`null` 输出为空。

模板上下文（按当前玩家可见范围生成）：`me`（含 `persona`）、`title`、`round`、`phase`、`seats`、`aliveSeats`（不可见的身份为 null）、`teammates`、`params`、`state`（按 `visibility` 投影）、`turn`（发言轮次的 `SpeakTurn.vars`，引擎另注入 `maxChars`：发言取 `speechOutput({ max })` 的 `max`，点评取 `commentMax`，字数只在阶段配置写一次，模板不手写；`vars` 中自行设置 `maxChars` 会抛错）、`legalTargets`。`announce` 模板只能使用公开上下文（无 `me`、`teammates`、`turn`、`legalTargets`，`state` 只含 public 字段）。编译期静态检查变量根与状态字段可见性。

## 可见性

- 频道：`public`、`team:<team>`、`private:<seat>`、`host`（运营信息，AI 与观众都看不到）。
- 中途改变阵营的座位（`reassign` 改了 team，如野孩子变狼）只能看到新阵营频道中加入之后的日志（`Seat.teamSince` 记录加入时的日志序号，同一个 compute 中 reassign 之后写的日志可见）；L4 历史与泄露检查都按此过滤（`entryVisibleTo`）。
- 状态可见性：`public`、`host`、`ownerOnly`（按座位号索引，只能看到自己那项）、`{ team }`、`{ project(value, viewer) }`。
- 身份可见：本人、`publicRole` 角色、`knowsTeammates` 角色的同阵营。
- 观众视图：`public` 模式只推送 public 频道事件，身份按公开规则显示，终局按 `revealOnEnd` 揭示；`omniscient` 模式推送除 host 外的全部频道并显示全部身份。

## AI 管线

请求 ID 为 `阶段#访问次数:槽位:a尝试次数`。收到回复后依次执行：schema 解析 → 合法目标与数量 → 内容校验。`act` / `vote` 输出里的座位号用 `phases/seatNumber.ts` 的 schema：整数之外也接受只含数字的字符串（模型常把 `3` 写成 `"3"`，解析时转成数字），`"abc"`、`"3.5"`、`3.5`、`""` 仍被拒绝；模型看到的 JSON Schema 仍是 `integer`。失败且未超过 `retries`（默认 1）时带错误原因重新发出；否则执行兜底（`speak` 必须提供 `fallback`，`act` / `vote` 随机合法目标，`judge` 可选 `fallback`，默认随机判定）。兜底输出同样经过校验，不合法视为 spec 错误。每次兜底在 host 频道留下 `fallback` 日志。`ai_failed` 直接兜底，不再重试。

## 调试

创建快照时传入 `debug`（可指定断点，默认取 `spec.debug.breakpoints`）即为调试局。断点在进入阶段前生效；指令：`continue`（到下一个断点）、`step`（执行当前阶段后停在下一个阶段前）、`run`（不再暂停）、`skip`（不执行当前阶段直接按 `next` 跳转，`ctx.result` 为 null，该阶段上一次访问留下的结果也会被删掉）。

## 测试工具（@battle/engine/testing）

- `runToEnd(game, { seed, playerCount | players, params, agent, debug, onPause })`：在内存中跑完一局，记录全部日志、舞台事件、AI 请求及发出时的快照。默认 agent 为脚本化输出。
- `assertTerminates(game, seeds)`、`assertDeterministic(game, options)`、`assertNoLeak(game, run)`：每个游戏都应以 100 个种子运行三项性质检查。泄露检查以文本比对为准，少于 4 个字符的内容不参与比对。
- 混沌模式 `chaosReply(game, snapshot, request)`（`debug/chaosAgent.ts`，由 `@battle/engine` 导出，服务端的混沌调试局也用它）与测试代理 `chaosAgent(game)`（`testing/chaos.ts`）：默认脚本永远合法、从不弃票、从不声明，覆盖不到重试、兜底、弃票、放弃与自爆等分支。混沌脚本按固定概率（`CHAOS_RATES`：传输失败 3%、不合法输出 10%、允许弃票时弃票 30%、可放弃的动作放弃 50%、有权声明时附带声明 25%）做出这些行为，每个决定由对局种子与请求 ID 派生，同一种子可复现。每个游戏另以 30 个种子跑混沌模式，断言终局、不泄露，且至少出现过一次弃票、一次声明（狼人杀为自爆）与一次兜底。默认的 `scriptedOutput` 不受影响（服务端的脚本化对局依赖它的精确输出）。

## 尚未实现

- token 预算：目前只限制 AI 请求次数，token 用量待服务端接入后补充。
