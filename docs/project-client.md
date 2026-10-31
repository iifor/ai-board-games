# C 端（packages/client）

> 状态：P5 完成大厅、开局、对局舞台（实时与回放）与历史对局。

## 路由

| 路径 | 页面 | 说明 |
| --- | --- | --- |
| `/` | `LobbyPage` | 游戏目录（来自 `GET /api/toc/games`） |
| `/play/:gameKey` | `SetupPage` | 选板子、按点击顺序选玩家（即座位顺序）、辩论赛可选自定义辩题，开局后跳转舞台 |
| `/matches/:matchId` | `StagePage` | 对局舞台；实时观看与回放是同一页面、同一条播放流 |
| `/history` | `HistoryPage` | 已完成的公开对局 |

路由用 react-router 7（`createBrowserRouter`），`app/` 只做路由与外层布局。

## 目录

```txt
src/
  app/                    路由、外层布局（导航）
  components/StatusView   统一的加载中 / 出错 / 空状态
  hooks/useAsync          一次性数据加载（loading / error / ready + 重试）
  services/               http（统一解析 ApiResponse，业务错误转 ApiError）、games、matches
  features/
    lobby/                GameList、SetupForm（PlayerPicker、TopicFields）、useMatchSetup、utils
    game-stage/           useMatchStream、usePlayback、playback/*（纯逻辑与媒体播放）、layouts/*、components/*
    history/              MatchList
  styles/global.css       颜色等设计令牌（含暗色）与基础样式
```

## 播放

- `useMatchStream(matchId)`：连接 `WS /api/toc/ws/matches/:id`，发送 `hello`（`afterSeq` 为最后确认的 seq），按 seq 去重地累积事件；断线 1.5 秒后自动续播；收到 `end` / `error` / `status: failed` 后不再重连。
- `usePlayback(items, ack, options)`：依次播放事件——有服务端音频播音频；否则对发言、点评、播报类事件使用浏览器朗读；其余按字数停留。**每个事件播放完才 ack**，服务端据此推进下一个事件，因此观众暂停时 AI 也会在领先若干事件后停止生成。暂停只阻止开始新的事件；只有卸载页面或切换对局时才中止正在播放的事件。
- 倍速作用于音频播放速率、朗读语速和停留时长；静音时全部按停留时长展示。
- `playback/describe.ts` 把舞台事件映射为字幕（说话座位 + 文本），与服务端选择合成语音的文本保持一致。

## 布局

`layouts/registry.tsx` 把游戏声明的 `presentation.layout` 映射到组件：

- `versus`（辩论赛）：左正方、右反方（按席位排序）、下方评委席，中间辩题（`view.extra.topic`）与字幕。
- `circle`（狼人杀）：座位绕成一圈，中间字幕与板子名（`view.extra.board`），警长标记来自 `view.extra.sheriff`；窄屏退化为两列网格。

座位卡片只显示观众视图中可见的身份（不可见为"身份未知"），出局者置灰，正在说话者高亮。新增布局时实现 `LayoutProps` 并在注册表登记。

## 约定

- 前端不决定任何游戏结果，只展示服务端下发的事件与观众视图；不处理密钥。
- 开发端口 `5173`，`/api`（含 WebSocket）代理到 `http://127.0.0.1:3100`。
- 测试：纯逻辑（字幕映射、时长、选人工具、流地址）与组件静态渲染（`react-dom/server`），无需浏览器环境。
