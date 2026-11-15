# 舞台导航与聊天分区

桌面舞台左上角放置返回大厅与对局记录按钮。对局记录默认展开在左下角，深蓝底色不透明度 58%，默认只看已播完的发言，可切换全部事件。历史与中央当前发言独立，中央不再混入历史文字；玩家发言不再同时显示底部重复字幕，主持播报保留原字幕。

当前发言居中，保留长文本换行、随播放进度滚动和手动阅读行为。记录的按钮开关、关闭按钮及 L 快捷键均保留。较矮的桌面窗口也将历史面板限定在视口内。

## 文件职责

本轮新增本文，没有新增生产组件或删除文件。复用已有舞台组件、历史记录和播放 hook。

| 修改文件 | 职责 |
| --- | --- |
| `packages/client/src/features/game-stage/pages/StagePage.tsx` | 左上导航、独立历史区域、历史排除当前段、消除玩家底部重复字幕 |
| `packages/client/src/features/game-stage/pages/StagePage.css` | 导航和历史定位、半透明底色、HUD 让位与矮窗口尺寸 |
| `packages/client/src/features/game-stage/components/PlaybackControls.tsx` | 支持由页面提供记录入口，播放栏隐藏重复按钮 |
| `packages/client/src/features/game-stage/components/Stage.tsx` | 中央发言组件不再接收历史列表 |
| `packages/client/src/features/game-stage/components/SpeechCarousel.tsx` | 仅渲染当前发言并保留滚动及进度控制 |
| `packages/client/src/features/game-stage/components/SpeechCarousel.css` | 当前发言在中央轨道垂直居中 |
| `packages/client/src/features/game-stage/layout.test.tsx` | 校验当前发言与独立历史分开、当前点评仅出现一次 |
| `docs/project-client.md` | 更新舞台分层和聊天展示约定 |

后端、API、数据库和共享协议类型没有改动；仅播放控制组件的可选 Props 调整。无需新增依赖。

## 验证

- 前台 TypeScript 检查通过。
- 前台 14 个测试文件、163 项测试通过。
- 使用 ego-browser 打开现有狼人杀公开回放，确认左上导航、独立历史记录和当前发言结构；按钮与 L 快捷键均可切换历史面板。
- 实际桌面窗口检测无横向溢出，当前发言水平居中，历史背景为 `rgba(6,18,36,0.58)`。605px 高的窗口中，历史面板底边 581px，保留底部 24px 距离。
- 浏览器截图接口及其底层截图请求均超时，未完成截图目测验收；上述浏览器结论来自实际页面语义、渲染尺寸和交互结果。

当前无须进一步拆分页面；历史内容继续复用 `StageRecord`，播放与权限投影沿用原模块。

## 2026-11-15 双记录面板调整

本次以双面板方案替代上文单历史面板：左下角「对局记录」只展示非玩家发言的流程事件，右下角「发言记录」展示已播完的玩家发言与点评。两者默认展开、独立关闭与展开。L 快捷键只控制左侧流程概览。

面板宽度改为 `clamp(260px,20vw,400px)`，高度改为 `clamp(240px,38vh,520px)`，背景为 `rgba(6,18,36,0.5)`，最大高度限制在视口内。条目背景透明，沿用较小字号。

修改文件与职责：

- `pages/StagePage.tsx`：组合左右面板、两个开关和各自的数据范围。
- `pages/StagePage.css`：左右停靠、收窄增高和 50% 背景。
- `components/StageRecord.tsx`：复用记录面板，支持标题和无筛选按钮的固定分类。
- `components/EventFeed.tsx`：新增本地 `overview` 筛选，排除发言与点评。
- `stage.test.tsx`：验证流程和多名玩家的发言、点评互不混入。
- `docs/project-client.md` 及本文：更新当前交互和验证记录。

没有新增或删除生产文件；后端、API、数据库、共享协议无变化。组件 Props 和前端本地筛选类型作相应扩展。

前台类型检查通过，15 个测试文件、170 项测试通过。真实公开回放中，2560×1360 桌面窗口的左右面板均为 400×517px，底部留白 24px，背景不透明度为 50%，两面板不互相重叠；独立开关及 L 快捷键通过页面交互检查。浏览器语义检查显示左侧无发言条目、右侧无流程阶段和主持播报条目。

### 后续座位与面板修订

`layouts/CircleLayout.tsx` 改用共享的 1.7 圆桌比例，首帧尺寸一并保持此比例；`layouts/CircleLayout.css` 更新回退宽高比。`pages/StagePage.css` 为圆桌两侧预留记录面板及 16px 间隔，4 号和 10 号随整体几何内收。`layout.test.tsx` 验证这两个座位内收后动效锚点仍与座位一致。前台 171 项测试及类型检查通过，实际页面 12 个座位均处于左右记录面板之间。

按随后要求，记录面板最终高度为 `clamp(360px,76vh,1100px)`，最大高度为视口减去 170px；两侧垂直居中、上下对齐。背景最终改为黑色、70% 透明，即 `rgba(0,0,0,0.3)`。实际 2560×1360 窗口中，两面板均高 1034px，顶边约 163px，中心位于视口高度的一半；浏览器尺寸及颜色检查通过。

最终样式同步至 `docs/project-client.md`。此轮没有新增或删除生产文件，没有后端、API、数据库或共享协议改动。

### 长发言整段展示

新增 `hooks/useFitSpeech.ts`，按中央轨道可用高度及文字真实排版二分适配字号；窗口变化、字体就绪和段落变化时重测。删除旧 `hooks/useSpeechScroll.ts`，当前发言不再自动或手动滚动。`components/SpeechCarousel.tsx` 接入适配 hook，`SpeechCarousel.css` 改为整段自然高度、按适配字号显示。`layouts/ringGeometry.ts` 将中央矩形的初始宽高比从 2.3 调为 1.5，先提供更多阅读高度，继续避让座位。左右记录面板的滚动保持原有行为。

类型检查和现有 171 项前台测试通过。使用临时页面加载真实 `Stage`、`SpeechCarousel` 和圆桌布局，分别验证约 120、700、1800 字并含空行的发言：开头与末句同时位于轨道内、内部无滚动、`scrollTop` 始终为 0，长内容按需缩字。在同一个已挂载舞台切换长段到短段后，字号从 8.51px 恢复至 26.568px。超长文本为保持整段显示会进一步缩小字号；常规发言优先使用原字号和新增高度。临时验收页面已删除。前台文档同步更新。

没有后端、API、数据库或共享类型改动。生产文件新增和删除各一个（适配 hook 替换滚动 hook），组件职责继续只负责组合展示与播放进度。
