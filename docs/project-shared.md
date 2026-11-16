# 共享协议（packages/shared）

`PlayerInput.name` 是选填的后台昵称，更新时省略表示保留，空字符串表示清除。`PlayerDto.name` 用空字符串表示无昵称，`modelDisplayName` 表示当前绑定模型的显示名。`PublicPlayerDto.name` 和新对局的 `AudienceSeat.name` 是模型公开名，`modelKey` 保存完整标识，`appearanceName` 用于取图。旧快照没有这些新增字段时仍可播放。

`azureStyles.ts` 统一维护官方风格标识与中文标签，后台显示、玩家候选列表和合成解析共用该映射。`speechControls.ts` 定义 `[短停]` 250ms、`[停顿]` 500ms、`[长停]` 900ms，`[放慢]`/`[加快]` 在音色基准上调整 -15%/+15%，`[抬高音调]`/`[压低音调]` 调整 +10%/-10%。恢复类标记回到对应音色基准。`TaggedSpeechSegment` 可携带语速/音高偏移和一次性前置停顿，`VoiceControlSupport` 表示经实测的控制能力。恢复和控制都只作用于当前这次发言，原始舞台协议及数据库结构不变。

`api/perspectives.ts` 定义管理端的私密行动目录、对局记录、当次请求及座位可见范围。`describeEvent` 与 `speechOf` 分别提供舞台文字及朗读台词，前台播放器与后台对照共用。

狼人杀上帝视角的 `revealed` 动效带有 `data.announcement = 'dawn'` 时，结果交给晨报朗读。旧回放按已登记的夜死、避刀和熊感知动效识别。播放器在使用已有音频前也会检查 `speechOf`。

`announcements.ts` 定义播报目录、编辑请求、可用变量示例，以及管理端和服务端共用的校验、渲染函数。狼人杀播报有独立的 `{变量名}` 集合，保存时要求保留本句所需变量。狼人杀播报替换只使用调用者提供的显示值。标记 `engineTemplate` 的辩题播报使用双花括号模板，编辑器通过服务端预览公开上下文。目录标注公开或私讯，接收范围由游戏规则决定。

`api/promptCatalog.ts` 定义管理员目录条目、上下文引用、预览和同一模型两次调用的结果。目录详情的 `source` 为已保存的通用模板，`defaultSource` 为出厂模板，`revision` 用于并发编辑校验。上下文引用指定内置样例序号或历史对局、请求 ID。预览的 `source: null` 表示历史模板源码未采集，`rendered` 仍是当时实际发出的文本。客户端只提交引用、草稿和选用的模型，服务端取回相应上下文。

`PlayerDto` 和 `PlayerInput` 的 `temperature`、`maxTokens`、`speechMaxChars` 分别保存玩家温度、输出预算和提示词里的建议篇幅。寡言、普通、健谈玩家的默认预算分别为 3072、6144、8192 tokens，对应建议篇幅为 80、250、500 字。数值为手动覆盖，null 为采用人设建议，更新时省略会保留原值。共享函数 `playerSpeechSettings` 计算有效配置。`ModelDto.maxTokens` 是供应商模型的输出上限，`TraceModelSettings` 保留调用时使用的参数。

`PromptComparisonInput` 接受人设、当前任务、模型来源及可选的可复用 `taskTemplate`。服务端记录实际渲染的任务文本。`PromptComparisonRecord` 记录草稿、共享模型参数、两次独立的 `PromptTrial` 及可发布模板的范围和覆盖内容。`PromptComparisonContext` 提供可编辑的模板、适用玩法与板子和当前已应用的对比记录 ID。旧请求可从已有请求节点恢复模板名，用 `{{originalTask}}` 在历史测试和后续请求之间保留各自动态任务。

`src/replay-import.ts` 定义 v1 剧本、原文引用、草稿版本和试播响应。`appearanceName` 允许舞台按绑定人物取图，`inspectionResult` 将查验动效结果与原话分开。字段和事件见[对局剧本导入](./replay-import.md)。

供应商模型目录返回 `ProviderModelOption[]`，包含远端模型 ID 和该供应商下是否已添加。批量导入使用 `ModelImportInput.modelIds`（每批最多 1000 个），返回 `ModelImportResult` 的新增与跳过数量。

`PlayerDto.modelId` 为 `number | null`。`PlayerInput.modelId` 传 `null` 表示解绑；省略时新建为未绑定，更新时保留绑定。

## 职责

`api/playerMemory.ts` 的 `MemoryReviewCall`、`MemoryCallStatus` 和 `MemoryReviewCallPage` 定义管理员读取跨局记忆复盘调用明细的分页协议。未收到的用量、耗时用 null 表示。

后台 `MatchTraceDto.match.roleNames` 带有该玩法注册的角色 ID 与中文名映射。「节点数据」用它标注历史座位快照；未登记的角色保留原始 ID。

- 前后端共享的协议类型：舞台事件、观众视图、游戏目录。只放协议，不放业务逻辑，不依赖任何运行时环境。
- 引擎日志与前端 StageEvent 使用同一套事件词表，避免两端各自定义导致漂移。

## 舞台事件（stage.ts）

`StageEvent = StagePayload & StageEventMeta & { view: AudienceView }`。

观战专用频道 `spectator` 用于已经结算的视觉提示，不进入任何 AI 的可见历史。技能结算复用 `revealed`，其 `data` 可携带 `effect`、`title` 和实际受影响的 `target`。上帝视图记录全员身份，以及此刻可以公开的 `publicRoles` 和已经翻牌的 `shownRoles`。服务端使用这两项生成单座位视图。

| kind | 字段 | 说明 |
| --- | --- | --- |
| `phase_started` | `title`、`announcement?` | 进入阶段；可选的公开主持台词随事件保存 |
| `narration` | `text`、可选的 `purpose: 'decision' | 'missed_speech'` | 主持播报。行动前的法官询问发送到接收座位的私密频道，客户端以主持人声音朗读，技能动效等实际行动发生时播放。 |
| `speech` | `seat`、`text`、可选的 `replyRequests`、可选的 `source: 'fallback'`（请求失败后系统代发的「过~」） | 玩家发言。有效的配合请求随原发言共享同一频道，每项含接收座号和分工；朗读使用原台词。 |
| `action` | `seat`、`action`、`targets`、`text`、可选的 `source`（`request_failed` 请求失败并放弃，`only_target` 唯一目标，历史 `fallback` 表示系统代选） | 玩家动作（默认私密，公开模式下观众看不到） |
| `vote_tallied` | `title`、`runoff`、`ballots`、`abstained`、`tally`、`tied`、`outcome`、可选的 `systemChoices`（按本轮投票座位记录来源，包括弃票） | 一轮计票；`ballots` 含票权，`abstained` 为弃票座位，`outcome` 为 null 表示平票进入复投 |
| `judgement` | `seat`、`verdict`、`verdictLabel`、`comment`、可选的 `source: 'fallback'` | 评委判定 |
| `seat_eliminated` | `seat`、`reason` | 出局 |
| `revealed` | `text`、`data` | 揭示信息；公开全部身份时 `data.roles` 为 `{ seat, role, team }[]` |
| `fallback` | `seat`、`reason` | 兜底记录，仅 host 频道，不进入观众视图 |
| `game_over` | `result` | 终局结果 |

- `StageEventMeta`：`seq`（单局内递增）、`round`、`phaseId`、`channel`。
- `AudienceView`：`gameKey`、`title`、`round`、`phase`、`status`、`seats`（不可见的身份字段为 null）、`extra`（游戏自定义的公开数据）、`result`。每个事件都附带事件发生当时的视图，前端可直接渲染，不需要自己累积状态。
- `GameResult`：`winner`、`winnerLabel`、`summary`、`mvp`、`endReason`（`normal` / `budget`）。

## REST 契约（api/*）

`AzureVoiceCatalogEntry` 是 Azure 区域目录中的 `{ voiceName, styles }`，用于后台按音色选择风格。`styles` 为空表示目录未列出额外风格；自然风格由后台以空字符串保存。目录接口只返回标识及风格，不返回密钥。

`api/traces.ts` 定义管理员可见的调用链契约：轻量节点索引包含阶段访问、直接请求 ID、此次推进输入和事件序号；节点详情含规则快照、关联决策、模型尝试或舞台视图。调用链独立删除后管理端对局详情通过 `traceDeleted` 表示停止采集。观众协议不包含这些诊断字段。

`GeneratedMatchRequest` 仅含游戏键、可选板子与参数，供本地调试开局使用。`CreateDebugMatchRequest` 支持按 `playerIds` 选择已有玩家，或用 `generatePlayers: true`、`scripted: true` 生成阵容，二者互斥。生成座位的 `MatchSeatDto.playerId` 为 `null`，可通过本局座位号区分。

- `common.ts`：`ApiResponse` 统一响应、`API_ERROR_CODES`、`isApiSuccess` 类型守卫。
- `auth.ts`：登录、改密、当前管理员。
- `resources.ts`：供应商（只有 `apiKeyMasked`，含 `modelCount`）、模型（含 `disabledReason` / `disabledAt`，以及连接测试结果 `ModelTestResult`）、音色（`language`、`gender`、`style`、`rate`、`pitch`、`sampleText`、`description`，以及试听请求/结果与导入结果）、玩家及公开玩家信息；`*Input` 中的可选字段允许 `undefined`（与 zod optional 一致）。四种资源的 `enabled` 都是：创建时省略默认 true，更新时省略保留原值。
- `matches.ts`：开局请求、调试局请求（`CreateDebugMatchRequest`：`seed`、`breakpoints`、`pacing`、`scripted`，以及 `chaos`——脚本化输出改用引擎的混沌脚本，只在 `scripted: true` 时有意义，服务端会拒绝"混沌但不脚本化"）、对局概要与详情（`MatchSummaryDto` 的 `debug` / `scripted` / `chaos` 三个标记一起出现，详情继承概要）、AI 调用记录、调试指令，以及 WebSocket 的 `ClientMessage`（hello / ack）与 `ServerMessage`（event + audio / status / end / error）。`MatchSummaryDto.layout`（`StageLayout`，必填）取自游戏的 presentation，前端渲染舞台不必再查游戏目录；游戏已不在注册表时服务端给 `circle`。

## 游戏目录（catalog.ts）

可选的 `GameCatalogItem.seatGroups` 按座号列出可预览的公开分组，复用 `VariantRoleItem`。其 `count` 按人数上限计算，数量可变时另有 `minCount`。狼人杀只返回模式的角色构成，辩论赛返回正方、反方和评委席。

`GameCatalogItem`：`key`、`title`、`description`、`players`、`layout`（`versus` / `circle`）、`variants`（key、name、description、players，以及展示用的角色构成 `roles`：角色名、阵营、数量，`rest` 按人数上限折算）、`defaultVariant`。服务端从游戏注册表生成，前端不硬编码游戏列表。

## 两端共用的口径（speech.ts、format.ts）

`speechTags.ts` 的 `parseSpeechTags` 识别登记的中文情绪标签，接受 `[冷静]` 和 `【冷静】` 两种括号；返回清理正文、分段风格和 `hasTags`。`TaggedSpeechSegment.style` 为 null 时沿用音色配置，空字符串表示自然风格。`stripSpeechTags` 给浏览器朗读及逐句字幕移除相同标签。普通括号内容如 `[3号]`、`【投票】` 保留。原始事件和记录仍保留输入原文。

`AudioRef.captions?: readonly AudioCaptionCue[]` 随现有 WebSocket 事件和音色试听响应传递；每项为 `{ text, startMs, endMs }`，时间单位为音频原始时间轴的毫秒，正文已移除朗读标签。字段可省略，兼容没有时间轴的历史音频及其他供应商。`captionTextChunks` 为服务端 Azure 对齐和前端估算字幕共用分句规则。只有完整正文能与 Azure 边界事件对齐时才提供时间轴。

- `speechOf(event)` 为语音合成、浏览器朗读和逐句字幕提供同一份 `{ text, seat }`。`seat` 为 null 时使用主持人声音。阶段事件有 `announcement` 时朗读台词，旧事件和普通标题仅展示。玩家发言和评委点评使用座位声音，行动、揭示和胜负由主持人播报。狼人杀终局视图的 `extra.winnerAnnounced` 为 true 时，此前已在复盘开始时公布胜负，结束语只报复盘结束。
- `formatMatchTitle(match)`："游戏 · 板子"，没有板子时只有游戏名；C 端与 B 端共用。
- `isSheriffChoice(event)`：识别狼人杀 `sheriff_signup`、`sheriff_withdraw` 的行动事件；`speechOf` 对上警／不上警、退水／继续竞选选择返回 null，服务端不合成逐人语音，客户端使用座位动效展示。`isSheriffSignup(event)` 只识别其中的上警选择，供候选状态计算使用。竞选发言及当选播报正常朗读。

## 测试约定

- 所有包统一使用 vitest，测试文件命名 `*.test.ts(x)`。engine 的测试放在 `packages/engine/test/`（含合成游戏 fixture 与跨包纯度测试），其余包的测试与源码同目录。
- 根目录 `vitest.config.ts` 以 `packages/*` 为项目列表。shared 的 `speech.test.ts` 用以事件类型为键的表覆盖每种舞台事件的朗读口径：新增事件类型时这张表编译不过，必须先决定它读不读、由谁读；同文件还测试 `formatMatchTitle`。

## 玩家记忆协议

`ForgetMemoryResult` 是管理员清除记忆接口的结果。`forgotten` 是本次实际清除的条数，`cancelledReviews` 是清空时取消的排队或执行中的复盘数。

`api/playerMemory.ts` 定义开局候选 `MemoryCard`、可定位的 `MemoryEvidence`、采纳的 `MemoryDecision`、后续请求 `MemoryUse` 和分页后台视图 `PlayerMemoryPage`。事件号和请求号均在来源对局内解释，玩家身份以稳定的玩家 ID 关联。前台舞台、观众视图和公开玩家 DTO 不携带这些私有字段。
