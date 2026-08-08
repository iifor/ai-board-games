# PostgreSQL 16 数据库迁移设计

日期：2026-08-08
状态：已批准，待实施计划
范围：CONSENSUS 服务端持久化层与生产数据库切换

## 1. 目标

将生产运行时从 SQLite/JSON fallback 完整迁移到 PostgreSQL 16，并重构数据访问边界，使事务、并发、健康检查、备份和恢复符合长期运行要求。

本次迁移采用独立自建 PostgreSQL 服务器，应用通过私网和 TLS 连接；首期仍保持单应用实例。图片、头像、上传文件和生成语音继续由现有文件资源目录保存，不进入 PostgreSQL。

## 2. 当前证据

截至 2026-08-08：

- 默认主库为 `packages/data/ai-presenter.sqlite`，约 769,404,928 bytes，WAL 约 4 MiB。
- 24 个服务端文件直接调用 `getDb()`。
- 服务端约有 181 次同步 `.prepare()` 调用和 15 个 `.transaction()` 入口。
- `getDb()` 暴露 `better-sqlite3`/JSON fallback 的同步接口，repository、service 和 workflow tick 均依赖该同步语义。
- 当前 Docker Compose 使用单应用容器和 SQLite volume；数据库、应用和本地持久卷处于同一部署故障域。
- 工作流事件序号依赖 `MAX(seq) + 1`，当前安全性部分来自 SQLite 单写者串行化。

因此，迁移成本主要来自异步传播、事务 client 传播和并发语义重建，而不是数据库文件大小。

## 3. 已确认决策

- 目标数据库：PostgreSQL 16。
- PostgreSQL 部署：独立自建服务器。
- 应用规模：首期单实例，不包含多实例 WebSocket、限流和容量协调。
- 实施路径：先收口数据库边界，再逐模块迁移，最后一次停机切换。
- 切换窗口：允许停机数小时。
- 不使用长期双写。
- 不引入 ORM，不重写业务模型。
- 生产运行时最终不再使用 SQLite 或 JSON fallback。

## 4. 数据范围

### 4.1 必须迁移

- 管理员账号与认证数据。
- 系统设置、皮肤、玩家、模型供应商、模型、语音包。
- 狼人杀角色与模式配置。
- 历史对局、对局玩家映射、玩家选择、历史回放事件。
- 玩家跨局长期记忆。

### 4.2 不迁移

- 旧 `matches` 工作流运行态。
- 旧 workflow 事件、AI task、pending action、outbox、快照、effect、interrupt 和运行时 memory snapshot。
- 旧 AI Trace、Span、LLM record、decision、观测事件和观测快照。

正式切换前必须确保没有进行中的对局。旧 SQLite/WAL 和资源备份按回滚策略保留。

## 5. 目标架构

```text
Controller
  -> Service
    -> Repository
      -> DbExecutor
        -> pg.Pool / pg.PoolClient
          -> PostgreSQL 16
```

`DbExecutor` 只提供以下能力：

- `queryOne`
- `queryMany`
- `execute`
- `withTransaction`
- `healthCheck`
- `close`

事务回调显式获得同一个 `PoolClient`。参与同一事务的 repository 必须使用该 client，禁止在事务内部重新从 Pool 取连接。

所有 repository 改为异步，`async` 逐层传播到 service 和 controller。不得通过阻塞等待或同步兼容层模拟 `better-sqlite3`。

生产运行依赖移除 `better-sqlite3` 和 JSON fallback。SQLite 读取能力只保留在一次性迁移工具及其测试依赖中。

## 6. PostgreSQL schema 约定

- 时间字段使用 `timestamptz`，统一写入 UTC。
- JSON 数据使用 `jsonb`；现有 `*_json` 字段名首期保留，减少上层改名范围。
- SQLite `AUTOINCREMENT` 映射为 PostgreSQL identity/sequence。
- 现有整数状态字段首期保持兼容，不额外扩展布尔值重构。
- 所有现有主键、唯一键和外键必须在 PostgreSQL 中显式重建。
- `INSERT OR IGNORE` 改为带明确冲突键的 `ON CONFLICT DO NOTHING`。
- `INSERT OR REPLACE` 改为带明确更新列的 `ON CONFLICT (...) DO UPDATE`。
- 禁止依赖 `PRAGMA`、SQLite 隐式类型转换或 replacement 删除再插入语义。

JSON 读取工具必须兼容 PostgreSQL driver 返回的对象；非法迁移 JSON 不得静默替换为空对象或空数组。

## 7. 事务与并发

### 7.1 普通事务

跨表业务写入必须使用 `withTransaction`。事务中的任意写入失败时整体回滚，controller 只返回统一业务错误，不泄露数据库信息。

### 7.2 工作流推进

- `tickMatch` 开始时使用 `SELECT ... FOR UPDATE` 锁定 Match 行。
- 同一 Match 同一时间只允许一个 tick 推进。
- 在 Match 行锁持有期间计算下一事件序号。
- 保留 `(match_id, seq)` 唯一约束和事件幂等键唯一约束。
- Match 更新、workflow event、outbox 和 snapshot 必须在同一事务提交。

### 7.3 队列领取

AI task 和 outbox 的领取使用 `FOR UPDATE SKIP LOCKED`。首期虽然保持单应用实例，但数据库领取语义从第一次 PostgreSQL 上线起就必须并发安全。

### 7.4 重试

只在完整事务边界对可识别的连接中断、序列冲突和死锁进行有限重试。参数校验、权限、状态冲突和其他业务错误不重试。

## 8. 连接、健康和安全

- 使用 `DATABASE_URL`、连接池上限、连接/查询超时和 TLS 配置。
- 应用账号只拥有业务 schema 所需权限，不拥有超级用户、建库或角色管理权限。
- PostgreSQL 只允许应用服务器私网地址访问。
- 健康检查必须实际验证 PostgreSQL；数据库不可用时应用不得报告健康。
- 日志不得输出连接串密码、SQL 参数中的密钥或完整敏感 JSON。
- 独立 PostgreSQL 服务器必须配置磁盘告警、每日全量备份、WAL 归档和恢复演练。

## 9. 一次性迁移工具

迁移工具是显式命令，不挂入服务启动流程：

1. 只读打开 SQLite。
2. 连接一个空 PostgreSQL 数据库。
3. 运行 PostgreSQL schema migrations。
4. 按外键顺序导入确认保留的核心表。
5. 校验和转换 JSON、时间、整数和空值。
6. 重设所有 identity/sequence。
7. 输出每表源/目标行数、主键重复、孤儿外键、JSON 错误和耗时。
8. 任一错误回滚整个导入事务。

工具必须拒绝向非空目标库重复导入，避免把一次性切换误做成不可控的合并同步。

## 10. 正式切换

1. 使用生产 SQLite 副本至少完成两次迁移演练并记录耗时。
2. 等待所有对局结束，禁止创建新对局。
3. 停止应用。
4. 执行 SQLite WAL checkpoint。
5. 成对备份 SQLite/WAL 与资源目录，并保留旧应用镜像。
6. 在全新 PostgreSQL 库运行 schema migrations 和核心数据导入。
7. 校验行数、主键、外键、JSON、sequence、回放顺序、玩家记忆和管理员账号。
8. 启动 PostgreSQL 版本。
9. 冒烟验证管理员登录、配置 CRUD、完整对局、历史回放、长期记忆和对局删除。
10. 验收通过后恢复真实流量。

验收期间不开放真实写流量，因此不需要把 PostgreSQL 新写入反灌 SQLite。

## 11. 回滚

正式验收失败时：

1. 停止 PostgreSQL 版本应用。
2. 恢复旧应用镜像。
3. 恢复同一时间点的 SQLite/WAL 和资源目录备份。
4. 启动旧版本并执行健康检查和核心冒烟测试。

PostgreSQL 数据保留用于故障分析，不直接覆盖后续重试目标库；重新迁移必须使用新的空库。

## 12. 实施阶段

1. PostgreSQL 连接池、`DbExecutor`、SQL migration runner、健康检查和测试数据库。
2. 管理员、设置、玩家、模型、语音、角色/模式、皮肤 repository 异步化。
3. 对局、回放、长期记忆和观测模块迁移；观测只支持新产生的数据。
4. 工作流 repository、tick、AI task、outbox、锁和全部 `async` 传播。
5. SQLite 核心数据迁移工具、校验报告、部署、备份和恢复文档。
6. 两次生产副本演练和正式切换。

每个阶段都必须独立通过检查，不允许把所有 repository 改造堆积为一个无法审查的大提交。

## 13. 测试与验收

- 纯业务单测不得依赖数据库。
- repository、migration 和 workflow persistence 使用真实临时 PostgreSQL 集成测试。
- 覆盖同 Match 并发 tick、事件序号唯一、幂等写入、AI task/outbox 并发领取。
- 迁移工具使用可控 SQLite fixture，验证保留表完整、不迁移表为空、sequence 正确、重复导入被拒绝。
- 完整类型检查、单测、PostgreSQL 集成测试、workflow 测试、管理端和 C 端构建全部通过。
- 运行态验证覆盖管理员登录、配置 CRUD、创建并完成对局、历史回放、长期记忆和删除对局。
- 正式切换前必须生成可审计的迁移校验报告。

## 14. 完成标准

只有同时满足以下条件，数据库迁移才算完成：

- 生产应用唯一业务数据库为 PostgreSQL 16。
- 生产启动路径不再引用 `better-sqlite3`、JSON fallback、`DATABASE_PATH` 或 SQLite volume。
- 所有数据库 repository 均通过 `DbExecutor` 或显式 transaction client 访问 PostgreSQL。
- 工作流事务和并发测试通过。
- 已确认的核心数据全部迁移并通过校验。
- 旧 workflow/Trace 数据未进入 PostgreSQL。
- 备份、恢复、监控、TLS 和最小权限配置已验证。
- 正式运行态冒烟测试通过，旧 SQLite 部署仍可在回滚保留期内恢复。

## 15. 明确不做

- 不引入 ORM。
- 不做长期 SQLite/PostgreSQL 双写。
- 不把图片、头像或语音文件存入 PostgreSQL。
- 不在本次迁移中实现多应用实例协调。
- 不迁移旧 workflow 调试数据和 AI observability 数据。
- 不同时重写游戏规则、API 协议或前端页面。

## 16. 工作量预估

在当前 24 个直接数据库调用文件、181 个同步 prepare 调用和 15 个事务入口的基础上，单人预计 6–9 周。最大风险仍是工作流事务、测试数据库改造、全部异步传播和正式切换演练，而不是数据导入本身。
