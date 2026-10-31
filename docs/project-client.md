# C 端（packages/client）

> 状态：P0 只有占位页面。P5 实现大厅、对局舞台与回放，届时补全本文档。

## 职责

- 大厅：选择游戏与 AI 玩家、开局。
- 对局舞台 `GameStage`：按游戏声明的布局（`versus`、`circle`）渲染 StageEvent，播放字幕与语音，按 ACK 节奏推进。
- 历史对局与回放。

## 约定

- 业务功能放在 `src/features/<feature>/`；API 请求放在 `services/`。
- 前端不决定任何游戏结果，只展示服务端下发的事件与观众视图。
- 开发端口 `5173`，`/api` 代理到服务端。
