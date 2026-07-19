# 过期工作流对局自动清理设计

## 目标

自动硬删除超过 7 天没有更新的 `running` / `waiting` workflow match，避免中断对局及其事件、快照、AI 任务和 outbox 长期占用 SQLite 空间。

## 范围

- 服务启动时立即清理一次。
- 服务持续运行期间每 24 小时清理一次。
- 仅删除 `updated_at < 当前时间 - 7 天` 且状态为 `running` 或 `waiting` 的 match。
- 刚好达到 7 天的 match 保留，超过 7 天才删除。
- 删除 `matches` 主记录，复用现有 `ON DELETE CASCADE` 清理关联 workflow 数据。
- 输出扫描数量、删除数量、match ID、估算释放逻辑字节数和耗时的结构化日志。

不在本次范围内：

- 不自动删除 `completed`、`failed`、`paused_debug`；现有调试终态保留规则继续生效。
- 不修改历史对局 `games` 的删除语义。
- 不在在线服务中执行阻塞式完整 `VACUUM`。
- 不新增管理后台页面、API、配置项或数据库表。

## 实现位置

沿用现有 workflow retention 模块，避免新增平行维护系统：

- `debugRetentionRepository.ts` 增加按状态和更新时间查询过期活动 match 的数据库方法，继续复用现有级联删除及逻辑字节统计。
- `debugRetention.ts` 增加 7 天保留常量、过期活动 match 清理函数和 24 小时维护间隔常量。
- `service.ts` 的 `initializeWorkflowMaintenance()` 在启动清理后注册一个 `unref()` 的原生 Node.js 定时器，每 24 小时执行一次清理。

不引入调度依赖。定时器使用 `unref()`，不阻止 Node.js 正常退出。

## 数据流

1. 维护入口计算 `cutoffIso = new Date(now - 7天).toISOString()`。
2. repository 查询 `status IN ('running', 'waiting') AND updated_at < cutoffIso` 的 match。
3. 对每个候选 match，先统计关联数据的逻辑字节数，再执行 `DELETE FROM matches WHERE id = ?`。
4. SQLite 外键级联删除关联 workflow 数据。
5. 输出 `workflow-stale-active-retention` 结构化日志。

清理函数允许传入当前时间，生产环境默认使用 `Date.now()`，测试使用固定时间验证 7 天边界。

## 错误处理

- 单次维护失败应记录错误，定时任务不能导致服务进程退出。
- 已被其他流程删除的 match 视为零变更，不计入成功删除数量。
- 不执行部分手工子表清理；所有关联数据由一个 match 删除事务和外键约束负责，避免留下半删除状态。

## 测试

在现有 workflow 持久化测试中覆盖：

1. `running` / `waiting` 且超过 7 天的 match 被删除。
2. 未满 7 天和刚好 7 天的 match 被保留。
3. 超过 7 天的终态 match 不受该规则影响。
4. 删除 match 后，其 workflow event、snapshot、AI task 和 outbox 被级联删除。
5. 清理结果中的扫描数、删除数和 match ID 正确。

## 上线与磁盘回收

自动清理释放的是 SQLite 内部页面，这些页面会优先被后续写入复用，但当前 `auto_vacuum=0` 的数据库文件不会立即缩小。

首次自动清理确认完成后，应在停服、完成数据库备份且磁盘空间充足的维护窗口执行一次：

```sql
PRAGMA wal_checkpoint(TRUNCATE);
VACUUM;
```

本次代码不自动执行 `VACUUM`，避免 3 GB 级数据库在在线请求期间被长时间锁定。

## 验收标准

- 服务启动和持续运行时均会执行清理。
- 只有超过 7 天未更新的 `running` / `waiting` match 被删除。
- 关联 workflow 数据全部级联删除。
- 清理失败不会终止服务。
- 类型检查及目标 workflow 持久化测试通过。
