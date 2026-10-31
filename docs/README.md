# 项目文档入口

本目录记录项目契约：业务边界、模块职责、协议约定、运行方式和变更影响。源码符号、调用链和具体文件位置交给 CodeGraph 查询，文档不维护逐文件索引。

## 推荐阅读顺序

1. `project-summary.md`：整体架构、包边界、依赖方向、命令与环境变量。
2. 按任务阅读：

| 任务 | 文档 |
| --- | --- |
| 引擎、GameSpec、基础动作、提示词、可见性、调试 | `project-engine.md` |
| 服务端 API、数据库、对局运行时、AI 调用、实时推送 | `project-server.md` |
| C 端大厅、对局舞台、播放与回放 | `project-client.md` |
| B 端配置、Trace、调试台 | `project-admin.md` |
| 共享协议类型与 schema | `project-shared.md` |
| 某个游戏的规则口径 | `games/<game>.md` |

设计依据：`superpowers/specs/2026-10-30-generic-battle-engine-design.md`；实施进度：`superpowers/plans/2026-10-30-generic-battle-engine.md`。

## 维护规则

- 修改流程、模块划分、关键 API、数据结构、运行配置、共享协议或重要约定时，必须在同次变更中更新对应文档。
- 文档与代码不一致时，以代码为准完成判断，并在同次变更中修正文档。
- 新增游戏时，在 `games/<game>.md` 记录规则口径（存在多种玩法解释的地方必须写明取哪一种）。

## 变更类型与文档映射

| 变更类型 | 必须更新 | 视影响更新 |
| --- | --- | --- |
| GameSpec 结构、基础动作、提示词分层、可见性规则 | `project-engine.md` | `project-shared.md` |
| 游戏规则口径 | `games/<game>.md` | — |
| REST API、WebSocket 消息 | `project-server.md` | `project-client.md`、`project-admin.md`、`project-shared.md` |
| 数据库表与迁移 | `project-server.md` | — |
| StageEvent、观众视图、游戏目录 DTO | `project-shared.md` | `project-client.md` |
| 命令、端口、环境变量、部署 | `project-summary.md` | `project-server.md` |
