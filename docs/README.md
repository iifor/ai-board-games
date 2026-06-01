# 项目文档入口

本目录是项目唯一正式文档入口，目标是让 AI 和开发者先通过文档理解项目，再按任务定向阅读源码，避免无目的全局扫代码。

## 推荐阅读顺序

1. 先读 `docs/project-summary.md`，了解整体架构、技术栈、目录和核心数据流。
2. 后端 API、Express、数据库、配置任务读 `docs/project-server.md`。
3. 游戏流程、AI 调度、WebSocket、工作流任务读 `docs/project-workflow.md`。
4. C 端游戏前台任务读 `docs/project-client.md`。
5. B 端后台管理任务读 `docs/project-admin.md`。
6. 共享类型、schema、常量、测试任务读 `docs/project-shared.md`。

## 文档维护规则

- 修改项目流程、模块划分、关键 API、数据结构、运行配置、工作流、共享类型或重要约定时，必须同步更新本目录对应文档。
- 如果文档与代码不一致，以代码为准完成判断，并在同次变更中修正文档。
- 新增模块时，应在对应项目文档中补充模块职责、入口、数据流和扩展注意事项。
- `dist/`、`node_modules/`、缓存目录、版本控制目录不纳入目录树说明；只在构建或部署章节说明构建产物。

## 变更类型与文档映射

| 变更类型 | 必须更新 | 视影响更新 |
| --- | --- | --- |
| API 路由、请求参数、响应结构 | `project-server.md` | `project-client.md`、`project-admin.md`、`project-shared.md` |
| WebSocket 消息、游戏事件、ack 流程 | `project-workflow.md` | `project-client.md`、`project-shared.md` |
| 数据库表、迁移、种子数据 | `project-server.md` | `project-workflow.md` |
| shared 类型、schema、常量 | `project-shared.md` | 对应消费端文档 |
| C 端游戏 UI、播放流程、页面路由 | `project-client.md` | `project-workflow.md` |
| B 端后台页面、管理资源、调试入口 | `project-admin.md` | `project-server.md` |
| 工作流 step、AI task、pending action、投影 | `project-workflow.md` | `project-client.md`、`project-shared.md` |
| 启动命令、端口、环境变量、部署方式 | `project-summary.md` | `project-server.md` |

## 文档职责

- `project-summary.md`：全局地图，只记录跨模块事实和阅读索引。
- `project-server.md`：后端服务架构和 API 分层。
- `project-workflow.md`：复杂游戏流程、AI 调度和 WebSocket 推进机制。
- `project-client.md`：C 端游戏前台架构。
- `project-admin.md`：B 端后台管理架构。
- `project-shared.md`：共享类型、schema、常量和测试约定。
