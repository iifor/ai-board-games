# C 端（packages/client）

> 状态：P5 完成大厅、开局、对局舞台（实时与回放）与历史对局。

## 路由

| 路径 | 页面 | 说明 |
| --- | --- | --- |
| `/` | `LobbyPage` | 头图（入口按钮 + 最近一局）、游戏目录（`GET /api/toc/games`）、最近对局（`GET /api/toc/matches`）。目录与历史分开加载：历史失败只在最近对局区显示错误与重试（头图条幅显示"暂时拉不到"），不冒充"还没有完成的对局"，头图与目录照常 |
| `/play/:gameKey` | `SetupPage` | 左侧板子列表（可按名称/角色搜索，显示角色构成）或辩题，右侧座位带（1..上限号座位按点击顺序坐人，点座位即取消就座，超员座位标红）+ 按点击顺序选玩家（即座位顺序），底部固定操作条（人数范围来自游戏目录的 `players`，板子有自己的范围时以板子为准；缺人 / 超员提示缺几人，够人未满员提示"可开局，还可再加 N 人"，只有到上限才说"人数已满"）；终局"同样阵容再来一局"通过路由 state 带入板子与玩家 |
| `/matches/:matchId` | `StagePage` | 对局舞台；实时观看与回放是同一页面、同一条播放流 |
| `/history` | `HistoryPage` | 已完成的公开对局 |

路由用 react-router 7（`createBrowserRouter`），`app/` 只做路由与外层布局；舞台路由全屏铺满、不显示导航。

## 视觉与动效

沿用旧版的"直播间"风格：深海蓝画布、玻璃面板（`.glass-panel`）、金色品牌色，游戏强调色由 `data-game` 覆盖（辩论赛青色、狼人杀紫色），令牌都在 `styles/global.css`。玩家海报（`public/player-posters`、`public/player-poster-cutouts`）与舞台背景（`public/stage/*.png`）取自旧版素材；`utils/posters.ts` 按玩家名匹配内置海报，匹配不到时用玩家自己的头像，再不行显示首字。

动效用 CSS 为主、Web Animations API 为辅（无动画库）。`prefers-reduced-motion` 下 CSS 动画由 `global.css` 统一关闭（组件 CSS 另把自己的错峰延迟归零，避免空白），JS 动效在 `lobby/animations.ts` 里判断后直接不动：
- 大厅：头图各元素与游戏卡片错峰淡入上浮（`.ui-fade-up` + `--i`，卡片排在头图之后）；游戏卡片悬停 / 键盘聚焦（`:focus-within`）是同一套状态：上浮、一道扫光（`::after` 动画一次）、图标亮起游戏强调色，说明与标签不动；"最近一局"卡片悬停上浮、背景缓慢放大并随指针轻微视差（`useParallax` 把偏移写成 `--px` / `--py`，纯计算 `parallaxOffset`），有最近一局时条幅显示胜方与时间，右侧"去开一局 → / 回放 →"做成胶囊按钮。
- 开局：选人时头像的克隆体从选人卡片飞到座位带的空位上（`animations.ts` 的 `flyTo`：弧线轨迹 `arcPoints` / `flightKeyframes`、按距离估算时长 `flightDuration`，克隆体挂在 body 上并复制 `data-game` 保留强调色），落地后座位卡片 `ui-pop-in` 弹出（`--seat-delay` = 落地时刻，由 `useSeatFlights` 记录）；取消就座时座位卡片原地缩小淡出（`fadeOut`）；随机补满 / 清空按座位错峰起飞 / 淡出；座位按玩家 ID 做 key，前面的人离席后面的人只是挪位不重新弹出。换板子时选中卡片左侧长出强调色边、角色标签按 `--i` 依次弹出，搜索框聚焦有强调色光晕；操作条进度条宽度过渡、凑够人后亮起，"开始对局"在人数刚凑够时脉冲一次（`usePulseOnce`：渲染期间比较上一次值，播完由 `animationend` 摘掉类名）。
- 历史：行错峰淡入上浮（错峰只排前 10 行），悬停 / 聚焦上浮并点亮右侧"回放 →"。
- 舞台：狼人杀昼夜背景按 `view.extra.period` 圆形揭开切换（`StageBackdrop`）；进入新阶段时大标题横扫而过（`PhaseBanner`）；发言者座位亮起扩散光环、立绘站在圆桌中央（`SpeakerSpotlight`，主持人也站在这里；行动事件如开枪、自爆由当事座位站到中央），没有立绘的玩家换成"发言者大卡"（`SpeakerCard`：大头像 + 名字 + 座位号 + 观众可见的身份 / 阵营，光环取阵营色 `--team-color`，进场同样用 `spotlight-in`；主持人始终用立绘）；夜晚没有在行动的存活座位闭眼（`SeatCard` 的 `seat-card-asleep`：去色压暗、顶部月光描边、闭眼小图标；正在行动的座位亮着发言光环，出局者保持出局样式；天亮靠座位卡既有的 opacity / filter 过渡交叉淡入）；字幕栏从下方滑入、文字从左向右揭开，进度条跟随真实播放进度（`SubtitleBar` + `SubtitleProgress`）；计票时选票从投票者座位沿弧线飞到目标座位（`BallotFlight`，Web Animations API：错峰起飞、落地时目标卡片一弹，弃票在原座位闪烁消失；时长 = 这段停留时长的六成、封顶 3 秒，随倍速缩放，没有当前段时 1.2 秒，纯计算在 `animation/ballotFlight.ts`），飞完票板的票数条才依次长出、当选者金色高亮（`VoteBoard` 的 `delayMs`；只有登记了 `ballotFlight` 的布局会飞，减少动效时不飞、票板立刻长条）；出局座位变灰并盖"出局"戳；终局结果以对话框弹出，展示 MVP 立绘（没有立绘时是发言者大卡式的大头像）、按阵营逐行揭示的阵容（`--i` 全表行号错峰，最后一行亮出后获胜阵营扫过一道光并留下金色光晕）与"同样阵容再来一局 / 从头回放"（`ResultPanel`、`ResultRoster`），可关闭后再用"查看结果"打开；记录侧栏开合时舞台让位，圆桌随之变圆、座位滑到新位置而不是跳过去。

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
    lobby/                LobbyHero、GameList（GameIcon）、RecentMatches、SetupForm（BoardPicker、SeatGrid、PlayerPicker、TopicFields、SetupActionBar）、
                          hooks（useMatchSetup：支持路由 state 带入的初值、fillRandom 返回新坐下的玩家；useSeatFlights：登记选人头像与座位槽、触发飞入 / 淡出并记录落地时刻；
                          usePulseOnce；useParallax）、animations（纯计算：arcPoints / flightKeyframes / flightDuration / parallaxOffset；执行：flyTo / fadeOut，reduced-motion 下返回 0）、
                          types（SetupInitial：终局 → 开局的路由 state 契约）、utils（选人、就座提示 selectionHint / readyLabel、板子搜索、rematchStateOf / isSetupInitial）
    game-stage/           stream/*（connection：连接 / 续播 / ack / 重连状态机，React 之外可测；reconnect：退避步长）、
                          useMatchStream（包一层 connection，session 变化时从头重订）、usePlayback、useSegmentState（订阅当前段的倍速 / 静音 / 进度）、
                          useResultDialog（终局卡开合）、useStageShortcuts（舞台快捷键：监听 keydown，键 → 动作交给 utils）、playback/*（describe 字幕映射、segment 每段的实时控制与进度、media 音频 / 朗读 / 停留与 present 选路）、
                          layouts/*（registry：布局组件 + 是否播选票飞行、CircleLayout + ringGeometry、VersusLayout）、
                          animation/*（ballotFlight：选票飞行的预算 / 时序 / 弧线 / 计划，纯计算；motion：prefers-reduced-motion 探测，JS 动效据此不动）、
                          constants（阵营标签、侧栏默认展开宽度、重连参数、快捷键提示文案、座位弹层间距）、
                          utils（昼夜、座位、夜晚步骤、发言顺序、评委判定、终局阵容、快捷键判定 / 倍速档 / 选项变化、座位发言汇总、弹层定位）、
                          components/*（StageBackdrop、StageHud、StageError、PlaybackControls、NightSteps、SeatCard（按钮，样式抹平在 SeatCardButton.css）、SeatPopover、Stage、StageCenter、SpeechOrder、
                          VoteBoard、BallotFlight、SpeakerSpotlight、SpeakerCard（含终局 MVP 共用的 SpeakerAvatar）、SubtitleBar、SubtitleProgress、PhaseBanner、ResultPanel、ResultRoster、EventFeed）、
                          stage.fixtures（测试共用的观众视图 / 事件元信息 / 对局概要）
    history/              MatchList（行错峰进场、悬停点亮"回放"）
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

`StagePage` 把各层绝对定位叠在全屏容器里：背景（0）→ 座位与舞台中央（4）→ 阶段横幅（35）→ 字幕栏（38）→ HUD、控制条、夜晚顺序、记录侧栏（40）→ 终局（60，`position: fixed` 铺满整个视口、不随舞台让位，并且是 `.stage-shell` 的最后一个子元素）。HUD 显示游戏与板子、LIVE / 连接中 / 连接中断 / 已结束、当前天数与阶段；控制条含暂停、倍速、静音与记录开关，放不下时换行；窗口 ≥1440px 时记录侧栏默认展开（舞台相应左移），可筛"只看发言"，收起时 `inert`，键盘不可达。所有附加信息只用已播放的公开事件算出（`utils.ts`）：夜晚行动顺序 = 本轮夜晚的 `phase_started` 标题；发言顺序 = 本阶段已发言的座位；评委判定徽章 = `judgement` 事件；终局阵容 = 终局视图里揭示的身份按阵营分组。窄屏（≤860px）退化为自上而下的普通页面：顶栏 → 舞台 → 字幕 → 控制 → 记录。

各层共用的尺寸定义在 `StagePage.css` 的 `.stage-shell` 自定义属性上：`--stage-rail-width`（控制条最大宽度，HUD 据此让位，两者不会重叠）、`--stage-subtitle-max-height`（字幕栏最大高度，舞台底部据此留白，字幕不会盖住座位）、`--stage-gutter`。

终局：`ResultPanel` 是 `role="dialog"` + `aria-modal` 的对话框，打开时焦点移入、Tab 在内部循环、Escape 或关闭按钮关闭、关闭后焦点还回（`hooks/useDialogFocus`）；关闭后舞台保持终局状态（座位、记录侧栏都可达），底部出现"查看结果"可再打开（`useResultDialog`）。对话框根元素就是遮罩，卡片是它唯一的网格项：列轨道给定为 `minmax(0, 1fr)`、`align-content: safe center`、卡片 `width: min(1000px, 100%)`，所以卡片永远居中于视口且不会比视口减边距宽（隐式 auto 轨道会被长摘要撑到比视口宽、再居中就把卡片推出左边缘——这是旧版"卡片被切掉"的原因）。播完后字幕栏停在最后一段。

交互：键盘快捷键由 `hooks/useStageShortcuts` 监听 `window` 的 keydown——空格 暂停 / 继续、← / → 倍速（控制条提供的 1 / 1.5 / 2 / 3 档，到头不变）、M 静音、L 记录侧栏、R 查看 / 关闭结果（只在有结果时响应）；键 → 动作是纯函数 `utils.shortcutActionOf`，选项变化是 `applyShortcut` / `stepSpeed`。按住 Ctrl / Meta / Alt、焦点在输入框 / 文本域 / 下拉框 / 可编辑区域时一律不响应；焦点在按钮上时空格交给按钮自己（原生激活，座位卡片靠它打开弹层，控制条按钮也不会被触发两次），其余情况空格 `preventDefault` 不滚动页面；长按的重复事件只拦默认行为不重复切换；Escape 不归快捷键（终局对话框与座位弹层各自处理）。控制条按钮与"查看结果"用 `title` / `aria-keyshortcuts` 标出快捷键（文案在 `constants.SHORTCUT_HINTS`）。座位弹层：点击 / 回车 / 空格座位卡片打开 `SeatPopover`（舞台页持有 `SeatSelection` 状态：座位号 + 卡片元素）——大头像（`Avatar`）、名字、座位、观众可见的身份 / 阵营、存活状态，以及这个座位本局已播放的公开发言与评委判定（`utils.speechesOfSeat`，旧的在前，每条带"第 N 轮 · 阶段"标题，判定文本与字幕同口径），列表可滚动；同一时间只有一个，同一座位再点关闭、点别的座位切换，点弹层外或 Escape 关闭（Escape 在 document 捕获阶段处理并截停，终局对话框开着时也只关弹层，再按一次才关对话框；点在座位卡片上不算点外面，卡片按 `data-seat-trigger` 识别），从头回放时关闭。弹层挂在 `.stage-arena` 里（层级 4 之内盖在座位与立绘上），位置由纯函数 `utils.popoverPlacement` 按卡片与舞台区域的包围盒算出（贴右侧、顶部对齐；右侧放不下翻到左侧；两侧都放不下贴右侧并夹回；上下夹回舞台内）写进 `--popover-left` / `--popover-top`，舞台变尺寸、座位滑动（`transitionend`）、弹层变高时重算；窄屏（`.stage-arena` 变成普通文档流）改为底部固定面板。打开时焦点移到弹层容器，关闭时焦点还在弹层里才还回座位卡片。

读屏：舞台上只有字幕栏是 live region（常驻的 `aria-live="polite"` 容器，每个事件在内层重新进场），阶段横幅、票板、夜晚顺序、控制条状态只展示不播报。小字颜色 `--ui-text-dim` 在舞台底色与玻璃面板上的对比度 ≥ 5:1。

## 布局

`layouts/registry.tsx` 把游戏声明的 `presentation.layout` 映射到 `{ Component, ballotFlight }`（舞台页从对局概要的 `layout` 字段取值，不依赖游戏目录接口；`ballotFlight` 说明布局有座位坐标、会播选票飞行，舞台据此让票板等飞完再长条）。`LayoutProps`：`center` 是舞台中央内容（`StageCenter`：票板 / 出局提示 / 发言顺序条 + 说话人立绘或发言者大卡），`badges` 是舞台算出的座位徽章，`period` 是昼夜（夜晚未行动的存活座位闭眼，`utils.ts` 的 `isAsleep`），`vote` 是正在播的计票（选票、弃票与时间安排 `VoteFlight`，由 `Stage` 用当前段的倍速算出）：

- `versus`（辩论赛）：左正方、右反方（标题下带各自观点，按席位排序）、下方评委席（带判定徽章），中间辩题（`view.extra.topic`）与舞台内容。
- `circle`（狼人杀）：座位绕圆桌一圈（1 号正上方、顺时针，竖排卡片，`data-seat` 标座位号），上下两排座位之间的区域留给舞台内容，桌下沿是板子名（`view.extra.board`），警长标记来自 `view.extra.sheriff`，昼夜来自 `view.extra.period`（没有时按阶段标题推断）；窄屏退化为四列网格。圆桌盒子由 `fitRingBox` 按量到的舞台尺寸算出（高度占满、宽度按 1.7 比例但不超过舞台，写进 `--ring-w` / `--ring-h`；舞台容器的网格轨道给定为 `minmax(0, 1fr)`，否则隐式轨道会被圆桌固有宽度撑出舞台，侧栏展开时右侧座位被压在侧栏底下），座位坐标由 `layouts/ringGeometry.ts`（纯函数）按盒子、座位数与卡片尺寸算出：卡片中心落在盒子里尽量大的椭圆上、按弧长等分（两侧不会像等角度那样挤在一起），相邻卡片放不下时整体缩小卡片（`--seat-scale`，最小 0.6），中央区域与桌面随卡片尺寸留边；量到尺寸之前按默认比例摆放。座位位置、缩放与桌面边距都带过渡，舞台让位时平滑重排。`seatAnchors` 把座位号映射到卡片中心，选票飞行据此取起落点（`BallotFlight` 挂在圆桌里、按挂载时的计划飞，飞行中布局变化不重排）。

座位卡片只显示观众视图中可见的身份（不可见为"身份未知"），出局者置灰并盖戳，正在说话者亮起光环，夜晚未行动的存活座位闭眼（出局者永远不"闭眼"）；光环颜色取 `global.css` 按 `data-team` 给出的 `--team-color`。卡片本身是 `<button>`（`SeatCard` 的 `onSelect` / `selected`，布局经 `LayoutProps.onSeatSelect` / `selectedSeat` 透传），点击 / 回车 / 空格打开座位弹层；浏览器按钮样式的抹平在 `SeatCardButton.css`（`:where()` 零具体度，`SeatCard.css` 的规则都能盖过；按钮不像 div 那样撑满父元素，所以给 `width: 100%`，评委席横排的卡片再改回按内容宽）。新增布局时实现 `LayoutProps` 并在注册表登记（有座位坐标的布局可以挂 `BallotFlight`）。

## 约定

- 前端不决定任何游戏结果，只展示服务端下发的事件与观众视图；不处理密钥。
- 终局 → 开局的"同样阵容再来一局"是跨 feature 契约：类型 `SetupInitial` 与生成函数 `rematchStateOf` 由 `features/lobby` 导出，`ResultPanel` 只用它们生成路由 state，`SetupPage` 用 `isSetupInitial` 校验。
- 开发端口 `5173`，`/api`（含 WebSocket）代理到 `http://127.0.0.1:3100`。
- 测试（vitest，`environment: node`，无需浏览器）按主题分文件，夹具在 `game-stage/stage.fixtures.ts`：
  - `game-stage/playback.test.ts`：字幕映射与朗读选择（与 `speechOf` 一致）、展示时长、媒体播放（假 `Audio` + 假计时器：自动播放被拦截、倍速实时生效、中途静音、停留重排）、`present` 选路（有音频播音频 / 行动用浏览器声音 / 阶段标题只停留 / 静音全停留）。
  - `game-stage/stream.test.ts`：退避步长；假 WebSocket + 假计时器：重连时 hello 带播放到的 seq、1/2/4/8/15 秒退避后报错与手动重试、结束后不重连、卸载取消重连。
  - `game-stage/layout.test.tsx`：布局与终局面板静态渲染（夜晚闭眼座位、圆桌里的选票飞行层、终局对话框"遮罩即根元素、卡片唯一网格项"的结构与 `ResultPanel.css` 的遮罩契约、阵容逐行揭示下标与获胜阵营、无立绘 MVP 的大头像）、焦点循环、环形几何（含窄舞台下圆桌盒子与座位全部落在盒子内、座位号 → 坐标）。
  - `game-stage/stage.test.tsx`：夜晚步骤 / 发言顺序 / 评委判定 / 阵容推导、海报匹配、昼夜、字幕栏与票板（含票数条按 `delayMs` 推迟）、发言者大卡 / 主持人与有立绘玩家的立绘、进度条、唯一 live region、HUD 连接状态与错误面板、流地址。
  - `game-stage/interaction.test.tsx`：快捷键判定（键 → 动作、修饰键与输入框不响应、按钮上的空格让给按钮）、倍速档步进与两端钳位、选项变化、控制条的快捷键提示；座位发言汇总（按座位、按播放顺序、轮次 / 阶段标题、判定口径）、弹层定位（贴右、翻左、夹回、间距）、弹层与座位按钮的静态渲染（身份 / 阵营 / 存活 / 出局、发言列表、关闭按钮、`aria-expanded`）。
  - `game-stage/flight.test.ts`：选票飞行纯计算——预算（停留时长六成、封顶、无倍速兜底）、时序分配（单张时长与间隔的上下限、随倍速缩放、减少动效为 0）、弧线控制点与采样、关键帧首尾、飞行计划（按投票者排序、弃票在后、无坐标跳过）。
  - `lobby/lobby.test.tsx`：选人工具、就座提示、板子搜索、再来一局 state、胜方 / 时间格式、游戏列表、选人卡片、操作条文案与凑够人时的脉冲、最近对局的失败 / 空 / 加载态与头图条幅（含最近一局的胜方 / 时间）、头图与卡片的错峰下标、座位带（按序就座、落地延迟、超员）、板子角色标签下标；动效纯计算（弧线采样、飞行关键帧、时长上下限、视差偏移与钳位）以及没有 DOM / WAAPI 时 `flyTo` / `fadeOut` 不动。
  - `history/history.test.tsx`：历史列表的行错峰下标（封顶）、每行的"回放"与链接。
  - 焦点移入 / 还回、快捷键的 keydown 监听、座位弹层的关闭（Escape、点弹层外）与定位重算依赖真实 DOM，没有自动化测试。
