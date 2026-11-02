# 共享协议（packages/shared）

## 职责

- 前后端共享的协议类型：舞台事件、观众视图、游戏目录。只放协议，不放业务逻辑，不依赖任何运行时环境。
- 引擎日志与前端 StageEvent 使用同一套事件词表，避免两端各自定义导致漂移。

## 舞台事件（stage.ts）

`StageEvent = StagePayload & StageEventMeta & { view: AudienceView }`。

| kind | 字段 | 说明 |
| --- | --- | --- |
| `phase_started` | `title` | 进入有标题的阶段 |
| `narration` | `text` | 主持播报 |
| `speech` | `seat`、`text` | 玩家发言 |
| `action` | `seat`、`action`、`targets`、`text` | 玩家动作（默认私密，公开模式下观众看不到） |
| `vote_tallied` | `title`、`runoff`、`ballots`、`abstained`、`tally`、`tied`、`outcome` | 一轮计票；`ballots` 含票权，`abstained` 为弃票座位，`outcome` 为 null 表示平票进入复投 |
| `judgement` | `seat`、`verdict`、`verdictLabel`、`comment` | 评委判定 |
| `seat_eliminated` | `seat`、`reason` | 出局 |
| `revealed` | `text`、`data` | 揭示信息；公开全部身份时 `data.roles` 为 `{ seat, role, team }[]` |
| `fallback` | `seat`、`reason` | 兜底记录，仅 host 频道，不进入观众视图 |
| `game_over` | `result` | 终局结果 |

- `StageEventMeta`：`seq`（单局内递增）、`round`、`phaseId`、`channel`。
- `AudienceView`：`gameKey`、`title`、`round`、`phase`、`status`、`seats`（不可见的身份字段为 null）、`extra`（游戏自定义的公开数据）、`result`。每个事件都附带事件发生当时的视图，前端可直接渲染，不需要自己累积状态。
- `GameResult`：`winner`、`winnerLabel`、`summary`、`mvp`、`endReason`（`normal` / `budget`）。

## REST 契约（api/*）

- `common.ts`：`ApiResponse` 统一响应、`API_ERROR_CODES`、`isApiSuccess` 类型守卫。
- `auth.ts`：登录、改密、当前管理员。
- `resources.ts`：供应商（只有 `apiKeyMasked`，含 `modelCount`）、模型（含 `disabledReason` / `disabledAt`，以及连接测试结果 `ModelTestResult`）、音色（`language`、`gender`、`style`、`rate`、`pitch`、`sampleText`、`description`，以及试听请求/结果与导入结果）、玩家及公开玩家信息；`*Input` 中的可选字段允许 `undefined`（与 zod optional 一致）。四种资源的 `enabled` 都是：创建时省略默认 true，更新时省略保留原值。
- `matches.ts`：开局请求、调试局请求（`CreateDebugMatchRequest`：`seed`、`breakpoints`、`pacing`、`scripted`，以及 `chaos`——脚本化输出改用引擎的混沌脚本，只在 `scripted: true` 时有意义，服务端会拒绝"混沌但不脚本化"）、对局概要与详情（`MatchSummaryDto` 的 `debug` / `scripted` / `chaos` 三个标记一起出现，详情继承概要）、AI 调用记录、调试指令，以及 WebSocket 的 `ClientMessage`（hello / ack）与 `ServerMessage`（event + audio / status / end / error）。`MatchSummaryDto.layout`（`StageLayout`，必填）取自游戏的 presentation，前端渲染舞台不必再查游戏目录；游戏已不在注册表时服务端给 `circle`。

## 游戏目录（catalog.ts）

`GameCatalogItem`：`key`、`title`、`description`、`players`、`layout`（`versus` / `circle`）、`variants`（key、name、description、players，以及展示用的角色构成 `roles`：角色名、阵营、数量，`rest` 按人数上限折算）、`defaultVariant`。服务端从游戏注册表生成，前端不硬编码游戏列表。

## 两端共用的口径（speech.ts、format.ts）

- `speechOf(event)`：哪些舞台事件要朗读、读什么——返回 `{ text, seat }`（`seat` 为 null 表示主持人声音）或 null（阶段标题、计票、出局提示、兜底记录只展示不朗读）。服务端据此合成语音，客户端据此决定是否朗读与朗读文本，两边只认这一处：评委点评连同判定一起读（`判定。点评`），行动（开枪、自爆……）、播报、揭示、终局总结由主持人读。
- `formatMatchTitle(match)`："游戏 · 板子"，没有板子时只有游戏名；C 端与 B 端共用。

## 测试约定

- 所有包统一使用 vitest，测试文件命名 `*.test.ts(x)`。engine 的测试放在 `packages/engine/test/`（含合成游戏 fixture 与跨包纯度测试），其余包的测试与源码同目录。
- 根目录 `vitest.config.ts` 以 `packages/*` 为项目列表；shared 目前只有类型，配置了 `passWithNoTests`。
