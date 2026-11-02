# C 端（packages/client）

> 状态：P5 完成大厅、开局、对局舞台（实时与回放）与历史对局。

## 路由

| 路径 | 页面 | 说明 |
| --- | --- | --- |
| `/` | `LobbyPage` | 头图（入口按钮 + 最近一局）、游戏目录（`GET /api/toc/games`）、最近对局（`GET /api/toc/matches`）。目录与历史分开加载：历史失败只在最近对局区显示错误与重试（头图条幅显示"暂时拉不到"），不冒充"还没有完成的对局"，头图与目录照常 |
| `/play/:gameKey` | `SetupPage` | 左侧板子列表（可按名称/角色搜索，显示角色构成）或辩题，右侧按点击顺序选玩家（即座位顺序），底部固定操作条（人数范围来自游戏目录的 `players`，板子有自己的范围时以板子为准；缺人 / 超员提示缺几人，够人未满员提示"可开局，还可再加 N 人"，只有到上限才说"人数已满"）；终局"同样阵容再来一局"通过路由 state 带入板子与玩家 |
| `/matches/:matchId` | `StagePage` | 对局舞台；实时观看与回放是同一页面、同一条播放流 |
| `/history` | `HistoryPage` | 已完成的公开对局 |

路由用 react-router 7（`createBrowserRouter`），`app/` 只做路由与外层布局；舞台路由全屏铺满、不显示导航。

## 视觉与动效

沿用旧版的"直播间"风格：深海蓝画布、玻璃面板（`.glass-panel`）、金色品牌色，游戏强调色由 `data-game` 覆盖（辩论赛青色、狼人杀紫色），令牌都在 `styles/global.css`。玩家海报（`public/player-posters`、`public/player-poster-cutouts`）与舞台背景（`public/stage/*.png`）取自旧版素材；`utils/posters.ts` 按玩家名匹配内置海报，匹配不到时用玩家自己的头像，再不行显示首字。

动效全部用 CSS（无动画库），`prefers-reduced-motion` 下全部关闭：
- 大厅与开局：卡片错峰淡入上浮（`.ui-fade-up` + `--i` / `animationDelay`）、悬停上浮与强调色光晕、选中座位号弹出。
- 舞台：狼人杀昼夜背景按 `view.extra.period` 圆形揭开切换（`StageBackdrop`）；进入新阶段时大标题横扫而过（`PhaseBanner`）；发言者座位亮起扩散光环、立绘站在圆桌中央（`SpeakerSpotlight`，主持人也站在这里）；字幕栏从下方滑入、文字从左向右揭开，进度条跟随真实播放进度（`SubtitleBar` + `SubtitleProgress`）；计票时票数条依次长出、当选者金色高亮（`VoteBoard`）；出局座位变灰并盖"出局"戳；终局结果以对话框弹出，展示 MVP 立绘、按阵营揭示的阵容与"同样阵容再来一局 / 从头回放"（`ResultPanel`、`ResultRoster`），可关闭后再用"查看结果"打开。

通用小部件：`components/Avatar`（内置海报 → 玩家头像 → 首字，`round` 圆形 / `figure` 立绘，座位卡、字幕栏、终局 MVP、选人卡片都用它）；胶囊标签统一用 `global.css` 的 `.ui-pill`（修饰类 `-accent` / `-brand` / `-outline` / `-soft`，使用处只覆盖颜色）；"游戏 · 板子"用 `@battle/shared` 的 `formatMatchTitle`（与 B 端共用），胜方、日期时间用 `utils/format.ts`（`formatWinner` / `formatDateTime`，24 小时制）。样式不用 `!important`：需要盖过通用规则时提高选择器具体度（如 `.playback-rail .playback-toggle:hover`），需要被媒体查询改写的值走自定义属性而不是内联样式（终局阵容列数 `--roster-columns`）；只有 `prefers-reduced-motion` 的全局关动效例外。

## 目录

```txt
src/
  app/                    路由、外层布局（导航；舞台路由不套导航）
  components/             StatusView（加载中 / 出错 / 空状态）、Avatar（海报 / 头像 / 首字）
  hooks/                  useAsync（一次性数据加载）、useElementSize（ResizeObserver 量尺寸）、useDialogFocus（对话框焦点移入 / 循环 / 还回 + Escape）
  services/               http（统一解析 ApiResponse，业务错误转 ApiError）、games、matches
  utils/                  posters.ts（玩家名 → 内置海报）、format.ts（胜方、日期时间；对局标题用 @battle/shared 的 formatMatchTitle）
  features/
    lobby/                LobbyHero、GameList（GameIcon）、RecentMatches、SetupForm（BoardPicker、PlayerPicker、TopicFields、SetupActionBar）、
                          useMatchSetup（支持路由 state 带入的初值）、types（SetupInitial：终局 → 开局的路由 state 契约）、
                          utils（选人、就座提示 selectionHint / readyLabel、板子搜索、rematchStateOf / isSetupInitial）
    game-stage/           stream/*（connection：连接 / 续播 / ack / 重连状态机，React 之外可测；reconnect：退避步长）、
                          useMatchStream（包一层 connection，session 变化时从头重订）、usePlayback、useSegmentState（订阅当前段的倍速 / 静音 / 进度）、
                          useResultDialog（终局卡开合）、playback/*（describe 字幕映射、segment 每段的实时控制与进度、media 音频 / 朗读 / 停留与 present 选路）、
                          layouts/*（registry、CircleLayout + ringGeometry、VersusLayout）、
                          constants（阵营标签、侧栏默认展开宽度、重连参数）、utils（昼夜、座位、夜晚步骤、发言顺序、评委判定、终局阵容）、
                          components/*（StageBackdrop、StageHud、StageError、PlaybackControls、NightSteps、SeatCard、Stage、StageCenter、SpeechOrder、
                          VoteBoard、SpeakerSpotlight、SubtitleBar、SubtitleProgress、PhaseBanner、ResultPanel、ResultRoster、EventFeed）、
                          stage.fixtures（测试共用的观众视图 / 事件元信息 / 对局概要）
    history/              MatchList
  styles/global.css       设计令牌、基础样式（.button、.glass-panel、.ui-pill）、通用动效
```

## 播放

- `useMatchStream(matchId)`：连接 `WS /api/toc/ws/matches/:id`（逻辑在 `stream/connection.ts` 的 `MatchStreamConnection`），连上即发 `hello`，按 seq 去重地累积事件；收到 `end` / `error` / `status: failed` 后不再重连。
  - 续播与丢失的 ack：`hello.afterSeq` 是**最后播放完的 seq**（不是最后收到的），服务端从它之后续推并把它当作确认；所以断线期间播完的事件虽然 ack 发不出去，重连时也会由 hello 一并补上，后台"观众确认"不会少一个。
  - 重连策略：断开后按 1、2、4、8、15 秒退避重连（步长确定，无抖动；`constants.ts` 的 `RECONNECT_*`），服务端对 hello 的任何回应都清零失败计数；连续失败 `MAX_CONNECT_FAILURES`（6）次后放弃自动重连，`connection` 变为 `lost`、`error` 为"连接中断，请刷新重试"，舞台顶部出现带"重试"的错误面板（`StageError`），`retry()` 清零计数立即重连。连接状态 `connecting / open / lost / closed` 由 HUD 显示为 连接中 / LIVE / 连接中断 / 已结束。
- `usePlayback(items, ack, options)`：依次播放事件（`playback/media.ts` 的 `present`）——有服务端音频播音频；否则 `@battle/shared` 的 `speechOf(event)` 不为 null 的事件用浏览器朗读 `speechOf(event).text`（发言、评委判定 + 点评、主持播报、揭示、行动、终局总结；行动由主持人声音读，字幕仍归到行动者座位）；其余按字数停留。**每个事件播放完才 ack**，服务端据此推进下一个事件，因此观众暂停时 AI 也会在领先若干事件后停止生成。暂停只阻止开始新的事件；只有卸载页面或切换对局时才中止正在播放的事件。
- 每段内容由一个 `SegmentControl`（`playback/segment.ts`）承载实时控制与进度：倍速立即作用于音频 `playbackRate` 与停留计时器（按已走过的比例重排剩余时间）；浏览器朗读的语速只能在开始前设定，倍速改变要到下一段才生效。静音立即停掉正在播的音频 / 朗读，剩余部分按字数停留走完；取消静音只对下一段生效。
- 停留时长 `displayDuration` 按字数估算（160ms / 字，最少 0.9 秒，不封顶），倍速缩短；静音时全部按停留时长展示。
- 字幕进度条（`SubtitleProgress`）：音频在播时跟随音频元素 `timeupdate` 报告的实际进度；朗读与停留按同一个 `displayDuration` 线性推进（CSS 动画，倍速改变时从当前比例重新起算）。只有字幕栏订阅进度，舞台其它部分不随进度重渲染。
- `playback/describe.ts` 把舞台事件映射为字幕（说话座位 + 文本）：要朗读的事件字幕就是 `speechOf` 给出的文本（与服务端合成语音的文本是同一处，判定字幕为"判定。点评"）；不朗读的事件（计票摘要、出局提示、阶段标题）自己拼字幕，兜底记录不上字幕。

## 舞台分层

`StagePage` 把各层绝对定位叠在全屏容器里：背景（0）→ 座位与舞台中央（4）→ 阶段横幅（35）→ 字幕栏（38）→ HUD、控制条、夜晚顺序、记录侧栏（40）→ 终局（60）。HUD 显示游戏与板子、LIVE / 连接中 / 连接中断 / 已结束、当前天数与阶段；控制条含暂停、倍速、静音与记录开关，放不下时换行；窗口 ≥1440px 时记录侧栏默认展开（舞台相应左移），可筛"只看发言"，收起时 `inert`，键盘不可达。所有附加信息只用已播放的公开事件算出（`utils.ts`）：夜晚行动顺序 = 本轮夜晚的 `phase_started` 标题；发言顺序 = 本阶段已发言的座位；评委判定徽章 = `judgement` 事件；终局阵容 = 终局视图里揭示的身份按阵营分组。窄屏（≤860px）退化为自上而下的普通页面：顶栏 → 舞台 → 字幕 → 控制 → 记录。

各层共用的尺寸定义在 `StagePage.css` 的 `.stage-shell` 自定义属性上：`--stage-rail-width`（控制条最大宽度，HUD 据此让位，两者不会重叠）、`--stage-subtitle-max-height`（字幕栏最大高度，舞台底部据此留白，字幕不会盖住座位）、`--stage-gutter`。

终局：`ResultPanel` 是 `role="dialog"` + `aria-modal` 的对话框，打开时焦点移入、Tab 在内部循环、Escape 或关闭按钮关闭、关闭后焦点还回（`hooks/useDialogFocus`）；关闭后舞台保持终局状态（座位、记录侧栏都可达），底部出现"查看结果"可再打开（`useResultDialog`）。播完后字幕栏停在最后一段。

读屏：舞台上只有字幕栏是 live region（常驻的 `aria-live="polite"` 容器，每个事件在内层重新进场），阶段横幅、票板、夜晚顺序、控制条状态只展示不播报。小字颜色 `--ui-text-dim` 在舞台底色与玻璃面板上的对比度 ≥ 5:1。

## 布局

`layouts/registry.tsx` 把游戏声明的 `presentation.layout` 映射到组件（舞台页从对局概要的 `layout` 字段取值，不依赖游戏目录接口），`center` 是舞台中央内容（`StageCenter`：票板 / 出局提示 / 发言顺序条 + 说话人立绘），`badges` 是舞台算出的座位徽章：

- `versus`（辩论赛）：左正方、右反方（标题下带各自观点，按席位排序）、下方评委席（带判定徽章），中间辩题（`view.extra.topic`）与舞台内容。
- `circle`（狼人杀）：座位绕圆桌一圈（1 号正上方、顺时针，竖排卡片），上下两排座位之间的区域留给舞台内容，桌下沿是板子名（`view.extra.board`），警长标记来自 `view.extra.sheriff`，昼夜来自 `view.extra.period`（没有时按阶段标题推断）；窄屏退化为四列网格。座位坐标由 `layouts/ringGeometry.ts`（纯函数）按量到的容器尺寸、座位数与卡片尺寸算出：卡片中心落在容器里尽量大的椭圆上、按弧长等分（两侧不会像等角度那样挤在一起），相邻卡片放不下时整体缩小卡片（`--seat-scale`，最小 0.6），中央区域与桌面随卡片尺寸留边；量到尺寸之前按默认比例摆放。

座位卡片只显示观众视图中可见的身份（不可见为"身份未知"），出局者置灰并盖戳，正在说话者亮起光环。新增布局时实现 `LayoutProps` 并在注册表登记。

## 约定

- 前端不决定任何游戏结果，只展示服务端下发的事件与观众视图；不处理密钥。
- 终局 → 开局的"同样阵容再来一局"是跨 feature 契约：类型 `SetupInitial` 与生成函数 `rematchStateOf` 由 `features/lobby` 导出，`ResultPanel` 只用它们生成路由 state，`SetupPage` 用 `isSetupInitial` 校验。
- 开发端口 `5173`，`/api`（含 WebSocket）代理到 `http://127.0.0.1:3100`。
- 测试（vitest，`environment: node`，无需浏览器）按主题分文件，夹具在 `game-stage/stage.fixtures.ts`：
  - `game-stage/playback.test.ts`：字幕映射与朗读选择（与 `speechOf` 一致）、展示时长、媒体播放（假 `Audio` + 假计时器：自动播放被拦截、倍速实时生效、中途静音、停留重排）、`present` 选路（有音频播音频 / 行动用浏览器声音 / 阶段标题只停留 / 静音全停留）。
  - `game-stage/stream.test.ts`：退避步长；假 WebSocket + 假计时器：重连时 hello 带播放到的 seq、1/2/4/8/15 秒退避后报错与手动重试、结束后不重连、卸载取消重连。
  - `game-stage/layout.test.tsx`：布局与终局面板静态渲染、焦点循环、环形几何。
  - `game-stage/stage.test.tsx`：夜晚步骤 / 发言顺序 / 评委判定 / 阵容推导、海报匹配、昼夜、字幕栏与票板、进度条、唯一 live region、HUD 连接状态与错误面板、流地址。
  - `lobby/lobby.test.tsx`：选人工具、就座提示、板子搜索、再来一局 state、胜方 / 时间格式、游戏列表、选人卡片、操作条文案、最近对局的失败 / 空 / 加载态与头图条幅。
  - 焦点移入 / 还回依赖真实 DOM，没有自动化测试。
