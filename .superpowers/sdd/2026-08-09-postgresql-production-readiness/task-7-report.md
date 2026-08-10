# Task 7 报告：清零 PostgreSQL 迁移遗留的 24 个关键 skip

日期：2026-08-10

## 结果

发布关键路径中的 `test.skip`、`it.skip`、`describe.skip` 已清零。原 unit 基线为 350 tests、326 pass、0 fail、24 skip；最终 unit 为 337 tests、337 pass、0 fail、0 skip，真实 PostgreSQL 为 83 tests、83 pass、0 fail、0 skip。

24 条迁移映射严格落地：

| 原位置 | 数量 | 最终归宿 |
|---|---:|---|
| first password change | 3 | `tests/postgres/authIntegration.test.ts` |
| login rate limit | 2 | `tests/postgres/authIntegration.test.ts` |
| player model quota/fallback | 8 | `tests/postgres/llmQuotaIntegration.test.ts` |
| Undercover stored replay | 1 | `tests/postgres/gameApplicationIntegration.test.ts` |
| Undercover debug runner | 1 | 恢复为 unit，显式 fake model 且断言零调用 |
| Werewolf action bridge | 7 | 恢复为 unit，并等待 async bridge |
| Werewolf action speech | 1 | 恢复为注入内存 executor 的 unit |
| Werewolf prompt context | 1 | 恢复为注入内存 executor 的 unit |

## TDD 证据

1. skip guard 首次 RED 报告上述关键文件中的全部 24 个 skip 及文件行号；迁移完成后 guard GREEN，匹配数为 0。scanner 只识别 `test.skip(`、`it.skip(`、`describe.skip(`。
2. auth PostgreSQL 组覆盖 forced-change 管理 API 拒绝、改密原子更新、登录 flag、规范化用户名第六次失败、六个并发坏密码计数。最终 5/5 通过，未暴露生产 bug。
3. quota PostgreSQL 组覆盖耗尽禁用、普通 429、limiter 后重查、fallback 耗尽、非额度错误、人工恢复、禁用模型连接探测、空成功响应拒绝。每次操作通过独立临时 schema 与显式 quota breaker 清理隔离；最终 8/8 通过。
4. 纯 unit 首轮因旧装配隐式依赖 PostgreSQL 而 RED；改为既有 repository/`DbExecutor` 注入后，Undercover 12/12、Werewolf bridge 8/8、speech 17/17、prompt 22/22，均 0 skip。
5. game application 首次真实 PostgreSQL 运行 RED：83 tests 中 82 pass、1 fail，创建 debug Undercover 等待 30.2 秒后 statement timeout。修复后 83/83，通过显式 `< 5s` 回归断言；最后一次验证中该用例耗时 230.0ms。

## 恢复覆盖暴露的最小生产修复

### PostgreSQL 时间格式兼容

OID 1184 原先返回 PostgreSQL 文本 `...+00`，而 repository contract、SQLite 行为及 models 管理 API 使用 UTC ISO `...Z`。`models/repository -> rowToModel -> service/controller` 会把 `disabled_at`、`created_at`、`updated_at` 原样公开，因此这是迁移后的真实 API 兼容问题，不是测试表示差异。

最小修复在通用 PostgreSQL executor 注册 OID 1184 parser：有效值统一为 ISO-8601 UTC `...Z`，特殊/不可解析值保持原样。直接 parser 测试和真实 model repository/service API shape 断言共同保护该契约。修复前一次完整 PG 为 82 tests、80 pass、2 fail；修复后全绿。

### debug breakpoint 事务复用

`tickMatch` 在 serializable 事务内锁定 Match；`evaluateDebugBreakpoint` 原先经全局 executor 创建带 Match 外键的 interrupt，内外连接互等至 30 秒超时。最小修复让 breakpoint evaluator 接受 `DbExecutor`，tick 传入当前 transaction；interrupt create/list 接受可选 executor 并始终在该 executor 内查询和写入，默认值保持其他调用兼容。未修改 workflow event 排序或数据库 schema。

## 游戏详情与回放链

新增真实链覆盖：

`createUndercoverWorkflowMatch -> games service save/get detail -> playbackRepository.listPlaybackEvents -> replayGameSession/PlaybackPipeline -> host/display socket payload`

测试以合法 sequence 逆序传入 `[2, 1]`，验证持久化详情与回放始终按 `[1, 2]` 返回并发送 host/display。brief 中的 `(sequence, created_at, id)` 与真实表不一致：`game_playback_events` 没有 surrogate `id`，主键为 `(game_id, sequence)`；在固定 gameId 下 sequence 已唯一，是比三键 tie-break 更强的全序约束，因此未新增 migration，也未修改 workflow/playback 排序。

## 最终验证

| 命令 | 结果 |
|---|---|
| `pnpm.cmd run test:unit` | 337 pass / 0 fail / 0 skip |
| `$env:TEST_DATABASE_URL='<指定测试库>'; pnpm.cmd run test:postgres` | 83 pass / 0 fail / 0 skip |
| `pnpm.cmd run test:workflow` | 127 pass / 0 fail / 0 skip |
| `pnpm.cmd run test:migration` | 60 pass / 0 fail / 0 skip |
| `pnpm.cmd run check:server` | 通过，0 diagnostics |
| `pnpm.cmd run check:shared` | 通过，0 diagnostics |
| `pnpm.cmd --filter @ai-presenter/db-migrator run check` | 通过，0 diagnostics |
| `pnpm.cmd run check` | 5/5 workspace projects 通过，0 diagnostics |
| `git diff --check` | 通过 |

PostgreSQL URL 仅通过测试进程环境变量传入，没有写入源码、报告或提交。

## 文件职责

新增：

- `tests/postgres/gameApplicationIntegration.test.ts`：真实 Undercover 创建、详情、持久化播放和 replay 全链验证。
- `.superpowers/sdd/2026-08-09-postgresql-production-readiness/task-7-report.md`：本任务的映射、TDD、验证与风险证据。

生产与文档修改：

- `packages/server/db/postgres.ts`：统一 `timestamptz` repository/API 输出契约。
- `packages/server/modules/workflow-engine/debugBreakpoint.ts`：允许断点判断复用调用方 executor。
- `packages/server/modules/workflow-engine/repository.ts`：interrupt create/list 可复用同一 executor。
- `packages/server/modules/workflow-engine/tick.ts`：把当前 transaction 传给 debug breakpoint。
- `docs/project-server.md`：记录 OID 1184 ISO UTC parser 约定。
- `docs/project-workflow.md`：记录 debug breakpoint 与 tick 的同事务约定。

测试修改：

- `tests/postgres/authIntegration.test.ts`：承接 5 个真实 auth PostgreSQL 用例。
- `tests/postgres/llmQuotaIntegration.test.ts`：承接 8 个隔离的 quota/fallback PostgreSQL 用例。
- `tests/postgres/dbExecutor.test.ts`：保护 OID 1184 parser。
- `tests/postgres/runPostgresTests.cjs`：注册 game application integration。
- `tests/unit/releaseGateConfig.test.ts`：新增关键路径 skip guard。
- `tests/unit/authFirstPasswordChange.test.ts`、`authLoginRateLimit.test.ts`、`playerModelFallback.test.ts`、`gameSocketSession.test.ts`：移除已迁移到真实 PostgreSQL 的重复/失真用例，保留纯逻辑覆盖。
- `tests/unit/undercoverGameRunner.test.ts`、`werewolfActionEngineBridge.test.ts`、`werewolfActionSpeech.test.ts`、`werewolfPromptContext.test.ts`：恢复 10 个纯逻辑 unit，并注入其真实依赖边界。

没有删除文件。前端无改动；API endpoint、请求/响应类型和数据库 schema 均无变化。时间字段的外部格式恢复既有 ISO `...Z` 契约。共享类型无变化。

## 风险与后续

PostgreSQL 全套退出码为 0，但 schema teardown 后，既有异步 observability 写入会输出 `PostgreSQL database has not been initialized` 警告；它不影响本任务断言或持久化验证，也不是本次 skip 清理引入的产品功能边界。若要消除日志，应另立任务让 observability 测试排空或注入其存储生命周期，避免把非阻断遥测清理扩大到本次生产修复。
