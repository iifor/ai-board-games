# C 端（packages/client）

> 状态：P5 完成大厅、开局、对局舞台（实时与回放）与历史对局。

## 路由

| 路径 | 页面 | 说明 |
| --- | --- | --- |
| `/` | `LobbyPage` | 游戏目录（来自 `GET /api/toc/games`） |
| `/play/:gameKey` | `SetupPage` | 选板子、按点击顺序选玩家（即座位顺序）、辩论赛可选自定义辩题，开局后跳转舞台 |
| `/matches/:matchId` | `StagePage` | 对局舞台；实时观看与回放是同一页面、同一条播放流 |
| `/history` | `HistoryPage` | 已完成的公开对局 |

路由用 react-router 7（`createBrowserRouter`），`app/` 只做路由与外层布局；舞台路由全屏铺满、不显示导航。

## 视觉与动效

沿用旧版的"直播间"风格：深海蓝画布、玻璃面板（`.glass-panel`）、金色品牌色，游戏强调色由 `data-game` 覆盖（辩论赛青色、狼人杀紫色），令牌都在 `styles/global.css`。玩家海报（`public/player-posters`、`public/player-poster-cutouts`）与舞台背景（`public/stage/*.png`）取自旧版素材；`utils/posters.ts` 按玩家名匹配内置海报，匹配不到时用玩家自己的头像，再不行显示首字。

动效全部用 CSS（无动画库），`prefers-reduced-motion` 下全部关闭：
- 大厅与开局：卡片错峰淡入上浮（`.ui-fade-up` + `--i` / `animationDelay`）、悬停上浮与强调色光晕、选中座位号弹出。
- 舞台：狼人杀昼夜背景按 `view.extra.period` 圆形揭开切换（`StageBackdrop`）；进入新阶段时大标题横扫而过（`PhaseBanner`）；发言者座位亮起扩散光环、立绘推到舞台中央（`SpeakerSpotlight`，主持播报时主持人立在右侧）；字幕栏从下方滑入、文字从左向右揭开（`SubtitleBar`）；计票时票数条依次长出、当选者金色高亮（`VoteBoard`）；出局座位变灰并盖"出局"戳；终局结果卡弹性弹出并展示 MVP 立绘（`ResultPanel`）；对局记录是可收起的侧栏。

## 目录

```txt
src/
  app/                    路由、外层布局（导航；舞台路由不套导航）
  components/StatusView   统一的加载中 / 出错 / 空状态
  hooks/useAsync          一次性数据加载（loading / error / ready + 重试）
  services/               http（统一解析 ApiResponse，业务错误转 ApiError）、games、matches
  utils/posters.ts        玩家名 → 内置海报
  features/
    lobby/                LobbyHero、GameList（GameIcon）、SetupForm（PlayerPicker、TopicFields）、useMatchSetup、utils
    game-stage/           useMatchStream、usePlayback、playback/*（纯逻辑与媒体播放）、layouts/*、utils（昼夜、座位查找）、
                          components/*（StageBackdrop、StageHud、PlaybackControls、SeatCard、Stage、StageCenter、VoteBoard、
                          SpeakerSpotlight、SubtitleBar、PhaseBanner、ResultPanel、EventFeed）
    history/              MatchList
  styles/global.css       设计令牌、基础样式、通用动效
```

## 播放

- `useMatchStream(matchId)`：连接 `WS /api/toc/ws/matches/:id`，发送 `hello`（`afterSeq` 为最后确认的 seq），按 seq 去重地累积事件；断线 1.5 秒后自动续播；收到 `end` / `error` / `status: failed` 后不再重连。
- `usePlayback(items, ack, options)`：依次播放事件——有服务端音频播音频；否则对发言、点评、播报类事件使用浏览器朗读；其余按字数停留。**每个事件播放完才 ack**，服务端据此推进下一个事件，因此观众暂停时 AI 也会在领先若干事件后停止生成。暂停只阻止开始新的事件；只有卸载页面或切换对局时才中止正在播放的事件。
- 倍速作用于音频播放速率、朗读语速和停留时长；静音时全部按停留时长展示。
- `playback/describe.ts` 把舞台事件映射为字幕（说话座位 + 文本），与服务端选择合成语音的文本保持一致。

## 舞台分层

`StagePage` 把各层绝对定位叠在全屏容器里：背景（0）→ 聚光立绘（2）→ 座位与舞台中央（4）→ 阶段横幅（35）→ 字幕栏（38）→ HUD、控制条、记录侧栏（40）→ 终局（60）。HUD 显示游戏与板子、LIVE / 已结束、当前天数与阶段；控制条含暂停、倍速、静音与记录开关。窄屏（≤860px）退化为自上而下的普通页面。

## 布局

`layouts/registry.tsx` 把游戏声明的 `presentation.layout` 映射到组件，`center` 是舞台中央内容（`StageCenter`：天数与阶段 / 票板 / 出局提示）：

- `versus`（辩论赛）：左正方、右反方（按席位排序）、下方评委席，中间辩题（`view.extra.topic`）。
- `circle`（狼人杀）：座位绕圆桌一圈（竖排卡片），桌面中央是板子名（`view.extra.board`）与舞台内容，警长标记来自 `view.extra.sheriff`，昼夜来自 `view.extra.period`（没有时按阶段标题推断）；窄屏退化为网格。

座位卡片只显示观众视图中可见的身份（不可见为"身份未知"），出局者置灰并盖戳，正在说话者亮起光环。新增布局时实现 `LayoutProps` 并在注册表登记。

## 约定

- 前端不决定任何游戏结果，只展示服务端下发的事件与观众视图；不处理密钥。
- 开发端口 `5173`，`/api`（含 WebSocket）代理到 `http://127.0.0.1:3100`。
- 测试：纯逻辑（字幕映射、时长、选人工具、流地址）与组件静态渲染（`react-dom/server`），无需浏览器环境。
