# 工作流 Match 彻底删除设计

## 目标

在 B 端工作流调试控制台为已加载的 Match 提供一个明确的“彻底删除对局数据”操作，一次清理该 Match 的工作流持久化、历史回放、AI 观测数据和专属音频资源。

当前数据证明不能把入口只放在 AI 观测或历史对局页面：本地共有 103 个 Match，只有 28 个存在同 ID 的 `games` 记录；调试 Match 不创建 Trace。删除必须以 `matchId` 为主线。

## 范围

删除：

- `matches` 及其外键级联的 workflow events、outbox、snapshots、AI tasks、pending actions、action windows、effects、interrupts 和 match memory snapshots。
- 同 ID 的 `games`、`game_players` 和 `game_playback_events`。
- Trace 根 Span 中 `game.id` 等于 Match ID 的 `game_traces`，以及其级联的 spans、LLM records、agent decisions、observability events 和 state snapshots。
- 该历史对局专属且未被其他对局引用的生成音频，以及对局音频目录。

保留：

- 玩家、模型、供应商、音色、角色、模式、皮肤和系统配置。
- `player_game_memories` 跨局长期画像。
- 其他 Match、历史对局、Trace 和共享音频资源。

不在本次范围：

- 批量删除、按日期删除或自动清理全部终态 Match。
- 在线执行 `VACUUM` 或 WAL checkpoint。
- 新增数据库表、外键或共享类型。
- 改变现有 AI 观测“删除观测数据”和历史对局“删除”按钮的语义。

## 方案选择

采用现有 ID 关联，不新增 `game_traces.match_id`：

- workflow Match、正式历史对局和非调试 Trace 已使用同一个运行时 ID。
- Trace 根 Span 的 `attributes_json` 已持久化 `game.id`，删除是低频管理操作，可直接用 SQLite JSON 查询定位。
- 调试 Match 没有 Trace，但仍能由 Match ID 正常清理。

未选择：

- 为 `game_traces` 新增并回填 `match_id`：需要迁移和额外类型改动，当前删除路径不依赖它。
- 重建统一对局父表：会扩大到全部游戏保存、回放和观测写入链路。

## B 端交互

在 `WorkflowDebugConsole` 成功加载 Match 后显示危险按钮“彻底删除对局数据”。

- 仅当已加载 Match ID 与输入框 Match ID 一致时可操作。
- 仅允许 `completed`、`failed`、`paused_debug`。
- `running`、`waiting` 和未知状态禁用按钮，并说明“进行中的 Match 不可删除”。
- 二次确认弹窗列出删除范围和不可恢复提示。
- 用户必须再次输入完整 Match ID；不一致时确认按钮不可用。
- 删除成功后清空已加载 Match、输入框和所有调试 Tab，并展示服务端返回的删除摘要。
- 删除失败时保留当前页面数据并展示服务端错误。

## API 与分层

新增：

```http
DELETE /api/admin/workflow/matches/:matchId
```

成功响应数据：

```json
{
  "matchId": "werewolf-...",
  "deleted": {
    "match": true,
    "game": true,
    "traces": 1
  }
}
```

职责：

- `routes.ts`：绑定 DELETE 路由。
- `controller.ts`：读取路径参数、调用 service、返回统一响应。
- `service.ts`：校验 Match、状态和删除顺序，编排 games、observability 与 workflow repository。
- `repository.ts`：只执行 `DELETE FROM matches WHERE id = ?` 并返回变更数。
- games service/repository：复用现有历史、回放和音频清理规则；轻量拆分数据库删除与提交后文件清理，避免复制逻辑。
- observability db：按 Trace 根 Span 的 `game.id` 删除关联 `game_traces` 并返回数量。

API 继续使用现有 `/api/admin` 鉴权中间件，不新增公开 C 端入口。

## 删除事务

1. 读取 Match；不存在返回 404。
2. 校验状态；非允许状态返回 409，不执行任何删除。
3. 读取同 ID 的可选历史对局，并保存后续文件清理所需的资源清单。
4. 在一个 SQLite 事务中：
   - 删除同 ID 的 `games` 数据库记录，复用外键清理 players/playback。
   - 删除根 Span `game.id` 等于 Match ID 的 Trace 主记录，复用外键清理观测子表。
   - 删除 `matches` 主记录，复用现有外键清理全部 workflow 子表。
5. 数据库事务提交后，复用现有共享资源判断清理专属音频。文件清理失败记录错误，但不伪造数据库删除失败或回滚已提交的数据。
6. 返回实际删除摘要。

SQLite 删除只释放可复用页面，不保证数据库文件立即缩小。接口不得执行 `VACUUM`；物理压缩继续遵循停服、备份、checkpoint、`VACUUM` 的维护窗口约定。

## 错误与并发边界

- 后端状态校验是最终权限边界，前端禁用不能替代它。
- 数据库删除使用单事务，任何数据库步骤失败都整体回滚。
- 删除请求具有结果幂等性，但第二次请求因 Match 已不存在返回 404，不返回假成功。
- 不允许删除正在运行或等待输入的 Match，避免与 worker、WebSocket session 或 pending action 并发。
- Match ID 只作为绑定参数使用，不拼接 SQL。
- 文件删除沿用现有路径校验和共享资源引用判断。

## 测试

新增 `tests/unit/workflowMatchDeletion.test.ts`，使用隔离数据库验证：

1. 终态 Match 的 workflow events、outbox、snapshots、AI tasks、actions、effects 和 interrupts 被级联删除。
2. 同 ID 的 game、playback 和 Trace 观测树被删除。
3. 其他 Match、game、Trace 与共享音频引用不受影响。
4. `player_game_memories` 保留。
5. `running`、`waiting` Match 返回冲突错误且所有数据保持不变。
6. 不存在的 Match 返回 404。

B 端当前没有通用 React 组件测试基线。本次执行 admin 类型检查，并在运行页面验证按钮状态、Match ID 二次确认、成功后清空状态和失败提示，不为一个按钮引入新的前端测试框架。

## 预计文件

修改：

- `packages/admin/src/pages/WorkflowDebugConsole/index.tsx`
- `packages/admin/src/services/adminApi.ts`
- `packages/server/modules/workflow-engine/routes.ts`
- `packages/server/modules/workflow-engine/controller.ts`
- `packages/server/modules/workflow-engine/service.ts`
- `packages/server/modules/workflow-engine/repository.ts`
- `packages/server/modules/games/service.ts`
- `packages/server/modules/observability/db.ts`
- `docs/project-admin.md`
- `docs/project-server.md`
- `docs/project-workflow.md`

新增：

- `tests/unit/workflowMatchDeletion.test.ts`

不修改数据库 schema、共享协议类型和 C 端代码。

## 验收标准

- B 端只能对已加载且允许状态的 Match 发起彻底删除。
- 服务端拒绝活动 Match，且数据库没有部分删除。
- 目标 Match 的工作流、历史、回放和观测数据全部消失。
- 长期玩家画像、其他对局和共享资源保持不变。
- API、服务端、B 端类型检查及目标测试通过。
- 文档明确区分逻辑删除释放页面与维护窗口物理压缩。
