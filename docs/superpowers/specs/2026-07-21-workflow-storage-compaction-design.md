# 工作流存储瘦身设计

## 目标

在不改变实时游戏、精确回放、REST/WebSocket 协议和正式历史对局的前提下，清理已有冗余数据，并阻止 workflow SQLite 再次因重复 JSON 快速膨胀。

## 已确认语义

- `workflow_events` 是工作流事件唯一真源。
- `outbox_messages` 只负责临时可靠投递，不承担永久回放；终局 pending 和 sent 消息超过 7 天后可硬删除。
- 每场 match 只保留最新 3 个 workflow snapshot。
- 正式历史继续由 `games` 与 `game_playback_events` 保存；本次不删除普通终局 match。
- `VACUUM` 只作为一次性维护操作执行，不放进在线定时任务。

## 方案

采用原位瘦身，复用现有 workflow maintenance：

1. 每日维护先全库裁剪 `match_snapshots`，每场只保留最新 3 条。
2. 删除超过 7 天的 sent outbox，以及终局 match 下超过 7 天仍 pending 的 outbox。
3. 新 outbox 的 `payload_json` 固定保存 `{}`；读取 outbox 时按 `match_id + event_seq` 从 `workflow_events` 恢复完整事件，旧数据继续兼容。
4. 狼人杀 workflow event 不再嵌入完整 `game`，状态恢复继续依赖现有 `statePatch` 与 snapshot；实时展示仍使用现有 EventBus/presentation 链路。
5. 一次性把历史 outbox payload 置空、裁剪历史 snapshot，并移除历史 workflow event 顶层 `game` 字段，再执行安全压缩。

不选择：

- 直接删除全部 completed workflow match：当前正式 `games` 覆盖不足，会丢失唯一历史记录。
- 对 JSON 增加压缩编码：会增加读取复杂度与 CPU 成本，且重复数据本身可以直接消除。
- 新增调度器或清理服务：现有每日 maintenance 已足够。

## 代码边界

- `debugRetentionRepository.ts`：执行 snapshot/outbox 批量清理与逻辑字节统计。
- `debugRetention.ts`：编排每日清理、统一 7 天 outbox 保留期并记录结构化日志。
- `repository.ts`：outbox 写引用、读事件真源并兼容旧 payload。
- `fallback.ts`：支持上述最小 SQL 语义，保证 JSON fallback 行为一致。
- `werewolf/handlers/common.ts`：停止向 workflow event 写入完整 `game`。
- `workflowPersistence.test.ts`：覆盖裁剪、7 天边界、outbox 恢复和最小 payload。
- `project-server.md`、`project-workflow.md`：记录持久化与保留契约。

不新增数据库表、公共 API、共享类型或前端文件。

## 数据与错误处理

- 清理查询使用严格小于 7 天 cutoff；刚好 7 天的记录保留。
- 每种清理独立执行并记录错误，单项失败不阻止其他维护项。
- outbox 引用找不到对应 event 时返回空 payload，不伪造成功事件；正常外键生命周期下不会出现该状态。
- 一次性数据库操作先生成新 SQLite 文件并执行 `PRAGMA integrity_check`，验证业务表行数及目标清理结果后再替换原文件。

## 测试与验收

- 新行为测试先失败，再写最小实现使其通过。
- workflow 测试、migration 测试和 server TypeScript 检查通过。
- 当前数据库完整性为 `ok`，每场 snapshot 不超过 3 条，过期 outbox 为 0。
- 历史 event 数量保持不变，仅移除冗余 `game` 字段；outbox 行数只按 7 天规则减少。
- 最终数据库文件明显小于当前约 484 MiB。
