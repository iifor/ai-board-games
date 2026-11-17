# 引擎（packages/engine）

模型玩家在开局时固定公开名、完整模型标识、人设和立绘。场上以座号区分同名模型。跨局记忆按玩家 ID 加载，涉及对手的记忆在提示词中按该对手 ID 标注本局座位和模型名。

狼人杀设置 `audienceView: 'omniscient'`。引擎生成完整舞台流，记录事件当时公开的身份及单人翻牌。观战专用的结算与转职消息写入 `spectator` 频道。玩家的提示词仍由原有频道可见性函数投影，host 运营日志不上舞台。

> 状态：P1 完成引擎核心并接入辩论赛；P2 加入阶段栈、触发器、终局转入、发言附加动作、加权投票、可放弃动作与公开身份，并接入狼人杀标准局；P7 加入玩法变体、阶段开关、座位改派、投票额外票与改换阵营后的频道可见范围，以及按局发牌（`setup.deal`）。

## 职责与边界

串行 `speak` 可配置 `followUp`，允许首轮发言同时返回可选的 `replyRequests`（座号和具体分工）。引擎校验同阶段、同频道的接收人并去重，有效分工附在原发言事件中，与发言共用可见性。频道成员在后续请求的历史里可见，只有被点名者收到回应任务。轮次还没到的参与者在原轮次回应；已发过言的参与者合并所有事项，最多追加一个发言轮次。补充发言的输出只处理正常发言内容。没有有效点名时直接完成原阶段。

`act` 与 `vote` 按每个行动者的合法目标分别判断。必须行动或投票且只有一个目标时，引擎直接记录动作或选票，沿用本阶段的频道、结算与票权。允许放弃或弃票时，单一目标仍会生成玩家请求。自动选择不生成模型请求 ID。

`advance` 的管理端诊断输出 `trace` 按实际执行顺序记录阶段访问、请求、校验结果、兜底、规则结算和事件序号。它独立于公开事件。发言与单人行动记录直接请求 ID；并行计票 / 投票淘汰记录本轮所有选票的请求 ID（复投重新收集）。控制流中最后触发推进的请求与直接参与结算的请求分开显示。规则快照包含当时的游戏状态和各席身份，仅供受保护的后台读取。

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
| `end` | 胜者判定，返回 `winner`、`winnerLabel`、`summary`、`mvp`，可选 `winners`（获胜座位；省略时引擎取阵营等于 `winner` 的座位，写入 `GameResult.winners`） |
| `triggers` | 事件触发器，见下文"阶段栈与触发器" |
| `gameOver` | `{ when, goto }`：阶段完成后检查，但只在主流程上（阶段栈为空）且没有排队的触发器链时判定——已触发的出局连锁（遗言、开枪……）先全部结算，开枪带走狼人可以推翻票数判定；命中时转入 `goto`（赛后环节或 `end`），只触发一次 |
| `budget` | `maxRounds`、`maxPhaseVisits`（默认 100）、`maxAiRequests`（默认 1000）、`maxStackDepth`（默认 8）；超限按 `endReason: 'budget'` 终局 |
| `presentation` | `layout`、`audienceView`（默认 public）、`areas`、`revealOnEnd`、`view`（观众视图附加数据，作者负责只放公开信息） |
| `debug` | 默认断点、调试发言内容 |

可选的 `presentation.phaseAnnouncement(ctx)` 在阶段通过启用检查并正式进入后求值一次，可返回一句公开主持台词。台词和是否播报都只能取决于公开信息。引擎把它随 `phase_started.announcement` 写入当次事件，实时和回放复用。没有配置台词的阶段沿用原有标题行为。

`act.decisionNotice(legalTargets, ctx)` 可为有合法目标的行动者生成一句法官询问。引擎首次发出选择请求时将询问记入对应座位的私密频道，记录类型为 `narration`，用途为 `decision`。跳过行动和重试请求都不会产生额外询问。

`CreateMatchInput.announcementOverrides` 由服务端在开局时提供，固定在该局快照中。游戏从规则上下文取该局的文案并传入允许的显示值。固定文本的 announce 阶段按模板名取覆盖值。旧快照缺省时使用内置文案。最终文本随事件持久化，字幕、语音与回放共用。

类型推断：`S` 只由 `state.schema` 决定，`P` 只由 `params` 决定（`init`、`apply`、`compute` 的返回值用 `NoInfer` 排除在推断之外）。所有回调都用方法语法声明，规则函数可以独立写在 `rules.ts` 中，参数类型为 `RuleContext<State, Params>`。

### 规则上下文 `ctx`

`state`、`params`（深度冻结）、`seats`（`SeatQuery`：`alive`、`dead`、`withRole`、`inTeam`、`position`、`except`、`where`、`get`、`ids`、`count`）、`round`、`phaseId`、`results`（各阶段最近一次结果，配合 `expectResult` / `findResult` 读取）、`result`（当前阶段结果，仅在 `next` / `apply` 中有值）、`endReason`、`random(label)`（由种子、阶段、访问次数与标签派生）、`trigger`（由触发器进入的阶段链中，触发它的事件）、`variant`（本局变体 `{ key, name, config }`，游戏没有变体时为 null）。

### 基础动作

| kind | 行为 | AI 输出 |
| --- | --- | --- |
| `announce` | 用**公开上下文**渲染模板，写入主持播报 | — |
| `speak` | `actors` 返回座位或 `SpeakTurn[]`（每轮可覆盖模板并带 `turn.*` 变量）；`sequential`（默认，后发言者能看到前面的发言）或 `parallel`；`validate` 做内容校验；`channel` 决定频道（默认 public）；`declarations` 允许有权的座位在发言时附带声明（如自爆），声明的可选 `describe` 回调生成公开动作文本。串行发言配置 `listenerPrompt` 后，首位开口前及每段发言后会向符合 `allowed` 的其他座位发出一批私下 `act` 请求，使用各自的可见上下文。`targets: []` 表示继续听，选择自身座号表示立即声明。同批多人声明时按座号取首个，只公开实际发动的动作 | `output` schema（标准为 `speechOutput({ max })`：`max` 提供阶段默认篇幅；座位有玩家设置时，`turn.maxChars` 取玩家建议字数。使用自定义 `output` 且两者都缺失时取 `DEFAULT_SPEECH_MAX_CHARS`（150））；启用 `allowSkip` 时允许显式返回 `{ speech: null }`，仅推进轮次，调用链保留决定，不生成发言；有权声明的座位额外获得可选的 `declare` 字段，null、空串或纯空白按省略处理，其他未登记的动作按原有规则拒绝 |
| `act` | 每个 actor 在 `targets` 中选 `count` 个；`allowNone` 允许输出空数组放弃（兜底默认放弃）；日志默认写入该座位私密频道；`apply` 把全部决定写回状态 | 自动生成 `{ targets, reason? }`，座位号接受 `3` 或 `"3"`（见"AI 管线"）；声明 `aside` 时追加可选的心里话字段（见下） |
| `vote` | 投票后计票，`weight` 设定票权，`bonus` 给出不属于任何投票者的额外票（如乌鸦诅咒，进入阶段时计算一次，每轮只计给该轮候选人；日志的 `tally` 含额外票、`ballots` 不含，AI 历史中显示为"额外票：5号+1"），`allowAbstain` 控制主动弃票，请求失败一律记为弃票；平票在并列者中复投 `tie.runoff` 次，仍平票按 `tie.then`（`seeded_random` / `none`），结果中的 `tied` 给出最终并列者、`ballots` 给出最后一轮的有效选票（不含弃票，规则可据此知道谁投了谁）；`onResult: 'eliminate'` 淘汰当选者（`eliminateCause` 为触发器用的原因）；`apply` 写回状态 | 自动生成 `{ target, reason? }`，允许弃票时 `target` 可为 null；座位号接受 `3` 或 `"3"`；声明 `aside` 时同样追加心里话字段 |
| `judge` | 评委依次判定，`verdicts` 定义选项与含义；多数决，无评委或并列时取 `tieVerdict`；`commentMax`（默认 300）提供阶段默认点评篇幅 | 自动生成 `{ verdict, comment }`，选项含义写入 schema 描述；模板从 `turn.maxChars` 读取该评委的篇幅建议 |
| `compute` | 纯函数结算：返回新状态、`reassign`（改变座位的角色或阵营；阵营改变时座位记录 `teamSince`，见"可见性"）、日志、淘汰列表，按此顺序生效（播报先于出局事件） | — |
| `reveal` | 写入一条揭示日志；`revealRoles` 向所有玩家与观众公开全部身份，并在日志 `data.roles` 中给出身份表 | — |

心里话（`AsideSpec`，`phases/aside.ts`）：`act` / `vote` 阶段声明 `aside: { maxChars? }`（默认 60）后，输出契约追加可选的 `aside` 字符串，描述引导模型平常省略、觉得此刻有博弈才说。非空时在该座位的行动日志或选票之前写一条 `speech`（`purpose: 'aside'`，频道 `spectator`）：观众可见可朗读，任何 AI 都看不到（包括说话者本人）。字数上限只写在字段说明里、不做校验：超长时按字截断并以省略号结尾（心里话只是点缀，不能因此重问或兜底跳过真正的行动）；空白不写。混沌脚本对声明了 `aside` 的阶段按 30% 附带一句，覆盖这条路径的泄露检查。

阶段可声明 `enabled(ctx)`：返回 false 时静默跳过（不记录、不计访问次数），直接按 `next` 跳转（此时 `ctx.result` 为 null），用于本局不存在的角色。跳过的阶段**不保留上一次访问的结果**：`ctx.results[phaseId]` 会被删掉，后续的 `when`、模板与 `findResult` 不会读到上一轮的数据（调试指令 `skip` 同样如此）。

跳转：`next` 为阶段 ID、`end`、`return`，或 `{ when?, goto, round? }` 列表（按顺序取第一个命中项，最后一项必须无条件）；`round: 'increment'` 使轮次加一。编译期检查跳转目标存在、所有阶段可达（从 `start`、触发器目标、`gameOver.goto` 出发），且只有触发器插入的阶段链可以 `return`。

### 阶段栈与触发器

- 事件：`seat_eliminated`（`seat`、`cause`、`reason`，任何淘汰都会派发）与 `action_declared`（`seat`、`action`，来自发言声明）。
- 触发器 `{ id, on, when?(ctx, event), push | jump, round?, unlessGameOver? }` 按声明顺序匹配。`unlessGameOver: true` 表示事件发生时 `gameOver.when` 已成立就不触发（炸弹人：放逐他本身已分出胜负时不再引爆）；默认不设，照常排队、链结算完再判胜负（猎人开枪可以推翻结论）。
- `push`：排入队列，等主流程上的当前阶段完成后插入；原本要去的目标（含轮次加一）压入阶段栈，插入链末尾 `return` 时再继续前往。队列只在主流程（阶段栈为空）上被消费：一条链内部的转换（如开枪 → 结算）不会被别的触发器插队，链 `return` 后才按排队顺序执行下一条。插入链中再触发的事件同样排队，所以遗言、开枪、被枪杀者的遗言会按触发顺序串起来。
- `jump`：立即中止当前阶段（作废其未完成的 AI 请求），清空阶段栈与队列后跳转，可附带轮次加一。
- 插入链中的阶段通过 `ctx.trigger` 读取触发事件（如出局者座位）。
- 胜负判定（`gameOver.when`）只在主流程上、队列为空时进行：插入链 `return` 回到主流程且没有排队的链之后才判定，所以天亮出局的猎人一定先开枪，被放逐的最后一头狼也仍有遗言。`gameOver` 命中后不再派发任何触发器。

## 提示词分层

正式局的可选 `memoryGenerations` 按玩家 ID 记录开局时的清空批次。服务端据此判断终局后能否为该玩家复盘；游戏规则和已发出的请求仍以本局快照为准。

正式对局的快照可包含按稳定玩家 ID 索引的 `playerMemories`。每次请求只检索行动者自己的开局记忆，按当前阶段、行动类型和近期发言人选最多三条。L4 分别展示往局经验和最多十二条可引用的本局事件摘录。候选事件先按请求当时的频道与入队时序过滤，排除系统兜底代发的台词（带 `source` 的发言、动作与判定；缺少来源标记的旧日志按同轮同阶段同席的兜底记录保守排除）。发出请求时固定记忆编号、事件编号和日志截止序号；同时行动的其他席位稍后产生的记录无法被回填为当时的依据。

正式请求的输出契约允许私有 `memoryNote`（简短判断、事件编号、明确引用的往局编号）。引擎先剥离笔记，再按游戏原有 schema 校验并执行行动。只对采纳的回复返回 `acceptedRequestId` 与规范化后的 `acceptedOutput`，供服务端在同一事务保存笔记。此接口独立于调试 Trace，舞台事件只包含游戏行动。缺少记忆字段的旧快照及调试局沿用原路径。

通用玩家表达文案要求使用当前音色提供的标记清单，未提供时使用纯台词。清单由服务端 AI worker 在调用前按座位音色补充，适用于发言和点评；无需引擎访问 Azure 或数据库。旧快照保存的表达示例仍受当前 worker 的候选清单约束。舞台日志保存的是经过标记校验的输出，Trace 另保留模型原始响应。

对局快照的 `promptSet` 保存本局注册模板原文、平台契约、玩家发言与情绪表达文案及适用的板子调试覆盖。引擎按行动渲染角色、规则和任务，使用该座位可见的上下文。主持模板只使用公开上下文。恢复对局、重试及跨实例推进均读取该局快照。旧快照缺少 `playerExpression` 时使用引擎内置的表达文案。

后台目录复用已编译的游戏注册表、模板解析器、公开/座位上下文和渲染器。模板变量只允许读取对象自身的字段。交互式草稿渲染可设置输出长度与展开步数上限。用于对比的脚本样例经过正常的 `advance` 流程，按请求保留该座位当时的可见变量、六层提示词和输出约束。

新生成的 AI 请求同时记录任务模板名、模板原文、游戏原始任务及该座位当次的可见模板变量。对局运行时写入 AI 任务前按玩法、板子、模板名读取当前应用版本，并用本次变量渲染。每次生成的角色知识、可见历史、合法目标与输出约束仍取自引擎。模板可用 `{{originalTask}}` 引用游戏在该次请求生成的任务；已入队的任务和传输重试均使用已保存的消息。

| 层 | 来源 |
| --- | --- |
| L1 平台契约 | 引擎内置 |
| L2 游戏规则 | `rulesText` |
| L3 身份 | 角色 `identity` 与玩家人设。所有游戏的玩家发言（`speak`）和评委点评（`judge`）还会收到通用表达提示（`prompt/playerExpression.ts`）：语气变化处按本次音色提供的朗读标记清单标注，没有清单时使用纯台词。标记随发言或点评正文保存。 |
| L4 可见历史 | 按该玩家可见频道过滤的日志（可见性先于压缩）。最近 2 轮（含当前轮）完整保留；更早的轮次只留播报、投票、出局、揭示等结构性记录，发言正文（公开发言、队内密谈、遗言）合并为一条“（第 N 轮的 K 条发言已省略）”放在该轮第一条发言的位置；压缩后仍超过 400 行时只保留最近 400 行（`prompt/history.ts`、`prompt/historyCompression.ts`） |
| L5 阶段指令 | 阶段或发言轮次的模板 |
| L6 输出契约 | 由输出 schema 生成的 JSON Schema、合法目标、上一次的错误原因 |

模板语法只有 `{{path}}`、`{{#each path}}…{{/each}}`（块内用 `this.x`）、`{{#if path}}…{{else}}…{{/if}}`；变量缺失或输出非标量会报错，`null` 输出为空。

模板上下文（按当前玩家可见范围生成）：`me`（含 `persona`）、`title`、`round`、`phase`、`seats`、`aliveSeats`（不可见的身份为 null）、`teammates`、`params`、`state`（按 `visibility` 投影）、`turn`（发言轮次的 `SpeakTurn.vars`，引擎另注入 `maxChars`：优先取座位快照中的 `speechMaxChars`，缺省时发言取 `speechOutput({ max })` 的 `max`，点评取 `commentMax`；`vars` 中自行设置 `maxChars` 会抛错）、`legalTargets`。`announce` 模板只能使用公开上下文（无 `me`、`teammates`、`turn`、`legalTargets`，`state` 只含 public 字段）。编译期静态检查变量根与状态字段可见性。

## 可见性

- 频道：`public`、`team:<team>`、`private:<seat>`、`host`（运营信息，AI 与观众都看不到）。
- 中途改变阵营的座位（`reassign` 改了 team，如野孩子变狼）只能看到新阵营频道中加入之后的日志（`Seat.teamSince` 记录加入时的日志序号，同一个 compute 中 reassign 之后写的日志可见）；L4 历史与泄露检查都按此过滤（`entryVisibleTo`）。
- 状态可见性：`public`、`host`、`ownerOnly`（按座位号索引，只能看到自己那项）、`{ team }`、`{ project(value, viewer) }`。
- 身份可见：本人、`publicRole` 角色、`knowsTeammates` 角色的同阵营。
- 观众视图：`public` 模式只推送 public 频道事件，身份按公开规则显示，终局按 `revealOnEnd` 揭示；`omniscient` 模式推送除 host 外的全部频道并显示全部身份。

## AI 管线

请求 ID 为 `阶段#访问次数:槽位:a尝试次数`。收到回复后依次执行：schema 解析 → 合法目标与数量 → 内容校验。`act` / `vote` 输出里的座位号用 `phases/seatNumber.ts` 的 schema：整数之外也接受只含数字的字符串（模型常把 `3` 写成 `"3"`，解析时转成数字；旁听声明的 `targets` 与发言附带的 `replyRequests[].seat` 同样适用），`"abc"`、`"3.5"`、`3.5`、`""` 仍被拒绝；模型看到的 JSON Schema 仍是 `integer`。收到 `ai_failed` 时立即消费本次请求。回复格式或内容不合法时，带错误原因重问 `retries` 次（默认 1），用尽后按相同方式处理。发言者在原频道说「过~」（发言事件带 `source: 'fallback'`，评委同样）。投票记弃票，行动跳过该座位的决定，旁听声明不发动。评委说「过~」并跳过该票，所有评委弃权时按平局处理。失败时的跳过独立于玩家正常提交时的必选校验。调用链和 host 频道保留原因。规则强制选择唯一目标的记录使用 `only_target`。

## 调试

游戏可用 `debug.speak` 提供特定阶段的脚本发言。返回 `undefined` 时该阶段沿用通用调试文案。

创建快照时传入 `debug`（可指定断点，默认取 `spec.debug.breakpoints`）即为调试局。断点在进入阶段前生效；指令：`continue`（到下一个断点）、`step`（执行当前阶段后停在下一个阶段前）、`run`（不再暂停）、`skip`（不执行当前阶段直接按 `next` 跳转，`ctx.result` 为 null，该阶段上一次访问留下的结果也会被删掉）。

## 测试工具（@battle/engine/testing）

- `runToEnd(game, { seed, playerCount | players, params, agent, debug, onPause })`：在内存中跑完一局，记录全部日志、舞台事件、AI 请求及发出时的快照。默认 agent 为脚本化输出。
- `assertTerminates(game, seeds)`、`assertDeterministic(game, options)`、`assertNoLeak(game, run)`：每个游戏都应以 100 个种子运行三项性质检查。
- `assertNoLeak` 分两层：
  - **结构检查**（`testing/structuralLeak.ts`，也单独导出 `requestStructuralProblems`、`omniscientStageProblems`）：不做文本比对，与内容长短无关。对每个 AI 请求，用发出时的快照和引擎自己的可见性函数逐项核对：
    - L4 历史必须恰好等于 `formatHistory` 对该座位按 `entryVisibleTo` 过滤后的渲染（录下的快照可能多出同一次推进中稍后写入的日志，最多回退 64 条找发出时的前缀），不可见日志的任何一行都不能混入，含 `team:werewolf` 狼刀选票、出局原因和技能目标；记忆摘录引用的日志也必须对该座位可见。
    - `taskTemplate.context` 中 `seats` / `aliveSeats` / `teammates` 的 `role`、`roleName`、`team`、`position` 只在 `roleVisibleTo` 允许时非空。`teammates` 只发给 `knowsTeammates` 角色，且只含同阵营的其他座位。`me` 是请求者本人。
    - `context.state` 与 `projectState(game, state, viewer)` 完全一致，`context.legalTargets` 与请求一致。
    - 上帝视角（`omniscient`）的游戏还要求舞台事件不来自 `host` 频道，`publicRoles` 在揭示与终局之前只含 `publicRole` 角色。
  - **文本比对**：不可见日志的正文及给 AI 看的整行渲染（含投票明细等结构化字段）、未投影的状态字符串，都不能出现在提示词任何一层；公开模式的舞台事件另查频道与身份。少于 4 个字符的内容不参与比对。
- 角色名、查验结果（好人/狼人）、阵营标签等短词本身就是规则与公开发言的常用词，降低阈值会大量误报。秘密在于"哪个座位对应它"，这种绑定由上面的结构检查覆盖。所以 `stateExtended.ts` 里底牌名仍用「」包起来，避免长文本比对误报。
- 混沌模式 `chaosReply(game, snapshot, request)`（`debug/chaosAgent.ts`，由 `@battle/engine` 导出，服务端的混沌调试局也用它）与测试代理 `chaosAgent(game)`（`testing/chaos.ts`）：默认脚本永远合法、从不弃票、从不声明，覆盖不到重试、兜底、弃票、放弃与自爆等分支。混沌脚本按固定概率（`CHAOS_RATES`：传输失败 3%、不合法输出 10%、允许弃票时弃票 30%、可放弃的动作放弃 50%、有权声明时附带声明 25%）做出这些行为，每个决定由对局种子与请求 ID 派生，同一种子可复现。每个游戏另以 30 个种子跑混沌模式，断言终局、不泄露，且至少出现过一次弃票、一次声明（狼人杀为自爆）与一次兜底。狼人杀每个板子另有混沌回合（`packages/games/test/werewolf/boardsChaos.test.ts`）：15 个种子，人数可变的板子跑最少和最多人数，断言终局、不泄露（含结构检查）、至少一次兜底，并用一个种子检查确定性。默认的 `scriptedOutput` 不受影响（服务端的脚本化对局依赖它的精确输出）。

AI 请求携带开局座位快照中的发言设置。发言和点评的建议篇幅仅进入任务提示。引擎会完整保存超过建议字数的有效回复。

## 尚未实现

- token 预算：目前只限制 AI 请求次数，token 用量待服务端接入后补充。
