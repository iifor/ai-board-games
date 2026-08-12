# 项目文档入口

本目录是项目唯一正式文档入口，目标是沉淀 CodeGraph 不负责维护的项目契约：业务边界、模块职责、运行方式、协议约定、部署规则和变更影响。源码符号、调用链、具体文件位置和实现细节优先交给 CodeGraph 查询，避免在文档里重复维护一份容易过期的源码索引。

## 与 CodeGraph 的分工

- `docs/` 负责回答“为什么这样划分”“改动会影响哪些契约”“运行和部署需要什么条件”。
- CodeGraph 负责回答“某个函数/类型在哪里”“谁调用了它”“从 A 到 B 的调用路径是什么”“修改某个符号的影响面”。
- 文档可以记录稳定目录边界和公共约定，但不维护逐文件源码入口、调用链清单或可由 CodeGraph 自动发现的信息。
- 如果文档与代码不一致，以代码和 CodeGraph 结果为准完成判断，并在同次变更中修正文档里的契约描述。

## 推荐阅读顺序

1. 先读 `docs/project-summary.md`，了解整体架构、技术栈、包边界、核心数据流和运行部署方式。
2. 后端 API、Express、数据库、配置任务读 `docs/project-server.md`。
3. 游戏流程、AI 调度、WebSocket、工作流任务读 `docs/project-workflow.md`。
4. C 端游戏前台任务读 `docs/project-client.md`。
5. B 端后台管理任务读 `docs/project-admin.md`。
6. 共享类型、schema、常量、测试任务读 `docs/project-shared.md`。
7. 狼人杀 AI 玩家提示词、PromptContext、LLM 调用和 trace 观测任务读 `docs/project-prompts.md`。
8. PostgreSQL 上线准备按 `docs/runbooks/postgresql-production-readiness.md` 执行；验收失败按 `docs/runbooks/postgresql-rollback.md` 回滚。

读完对应文档后，使用 CodeGraph 定位具体实现、符号调用关系和影响面；不要再通过维护文档里的源码路径表来替代 CodeGraph。

## 文档维护规则

- 修改项目流程、模块划分、关键 API、数据结构、运行配置、工作流、共享类型或重要约定时，必须同步更新本目录对应文档。
- 如果文档与代码不一致，以代码和 CodeGraph 查询结果为准完成判断，并在同次变更中修正文档。
- 新增模块时，应在对应项目文档中补充模块职责、边界、数据流、协议和扩展注意事项；具体源码文件和调用链由 CodeGraph 发现，不写成长期维护清单。
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
| PostgreSQL 上线门禁、演练、签核 | `runbooks/postgresql-production-readiness.md` | `postgresql-deployment.md` |
| PostgreSQL 切换失败回滚 | `runbooks/postgresql-rollback.md` | `postgresql-deployment.md` |

## 文档职责

- `project-summary.md`：全局契约，只记录跨模块事实、包边界、核心数据流、运行和部署方式。
- `project-server.md`：后端服务职责、API 分层、数据库和运行配置约定。
- `project-workflow.md`：复杂游戏流程、AI 调度、WebSocket 推进机制和持久化契约。
- `project-client.md`：C 端游戏前台职责、路由、播放体验和前后端协议消费约定。
- `project-admin.md`：B 端后台管理职责、管理资源、调试和观测约定。
- `project-shared.md`：共享类型、schema、常量和测试约定。
- `project-prompts.md`：狼人杀 AI 玩家提示词、动态上下文、LLM 调用和观测约定。
- `postgresql-deployment.md`：PostgreSQL 16 环境、权限、TLS、备份恢复和监控基线。
- `runbooks/postgresql-production-readiness.md`：正式切换前不可交换的 12 步准备与证据聚合流程；只准备和申请授权，不执行真实切流。
- `runbooks/postgresql-rollback.md`：切换验收失败后的旧镜像与同时间点 SQLite/WAL/SHM/资源恢复流程。
- `runbooks/postgresql-first-deployment-cutover.md`：首次 Linux Docker Compose 生产部署的 16 步执行、固定 Compose/镜像来源、typed freeze receipt、手工流量门禁、60 分钟观察和按 PostgreSQL 新写入分支的回滚决策。
