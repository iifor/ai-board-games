# Werewolf Engine And V2 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 跑通狼人杀调试局，收口最小的工作流驱动边界，并优化 v2 游戏控制、技能和发言交互。

**Architecture:** 保留现有 workflow-engine 作为流程推进器，给 WorkflowRuntime 增加唯一的持续驱动入口，runner 不再直接拼装推进循环。C 端继续复用 WerewolfGame 的事件、字幕和视角权限，仅在 v2 组合层增加游戏化控制和展示。

**Tech Stack:** TypeScript、Node test、React 18、CSS、pnpm workspace。

## Global Constraints

- 不新增依赖、数据库表、REST 或 WebSocket 消息。
- 不改变服务端狼人杀规则与玩家视角权限。
- 保留当前工作区已有改动，不重置或覆盖无关文件。
- 每个行为修改先补失败测试，再写最小实现。

---

### Task 1: 收口工作流驱动入口

**Files:**
- Modify: `packages/server/modules/game-engine/workflow/workflowRuntime.ts`
- Modify: `packages/server/modules/game-engine/engine/gameEngine.ts`
- Modify: `packages/server/modules/werewolf-runner.ts`
- Modify: `packages/server/modules/werewolf/workflow.ts`
- Test: `tests/workflow/aiTaskCompletion.test.ts`

**Interfaces:**
- Produces: `WorkflowRuntime.runUntilBlocked(matchId, options)` 与 `GameEngine.runUntilBlocked(matchId, options)`。
- Consumes: 现有 `workflowService.drainAiTasks()`，不复制 tick/task 判定。

- [ ] 写失败测试：同一入口在 tick 预算耗尽后继续推进，在等待点或终态停止。
- [ ] 运行目标 workflow 测试，确认因方法缺失而失败。
- [ ] 在 WorkflowRuntime 和 GameEngine 增加薄委托。
- [ ] 将狼人杀两个 runner 循环改为调用统一入口。
- [ ] 运行目标测试和完整 workflow 测试。

### Task 2: 跑通并复查调试局

**Files:**
- Modify only if a reproducible workflow defect remains.
- Test: `tests/workflow/werewolfWorkflowStatus.test.ts`
- Docs: `docs/project-workflow.md`

**Interfaces:**
- Consumes: `runWerewolfViaEngine(config, { onEvent })`。
- Produces: 可到达 `completed` 的调试局证据，或准确的失败步骤与错误。

- [ ] 用默认 12 人模式执行完整调试局并记录终态、轮数、事件数。
- [ ] 若失败，定位首个错误边界并写最小失败测试。
- [ ] 只修复可复现根因，重复执行直到终态。
- [ ] 检查 GameEngine/workflow/runner 是否仍有必须立即拆分的问题。

### Task 3: 优化 v2 游戏交互

**Files:**
- Modify: `packages/client/src/features/werewolf/WerewolfGame/index.tsx`
- Modify: `packages/client/src/features/werewolf/components/WerewolfControls/index.tsx`
- Modify: `packages/client/src/features/werewolf-v2/components/PerspectiveShared/index.tsx`
- Modify: `packages/client/src/features/werewolf-v2/components/WerewolfArenaV2/index.tsx`
- Modify: corresponding colocated CSS files
- Test: `tests/unit/werewolfV2InteractionState.test.ts`
- Docs: `docs/project-client.md`

**Interfaces:**
- Consumes: `activeEvent`、`activeSpeech`、`eventLog`、`currentSpeakerId`、既有控制回调。
- Produces: v2 游戏化控制坞、明确发言态、技能施放舞台；v1 保持原样。

- [ ] 为交互状态解析补角色技能和白天发言测试，并先确认失败。
- [ ] 为控制组件增加 v2 变体，不复制会话逻辑。
- [ ] 复用现有底部发言组件并强化座位发言高亮。
- [ ] 优化技能目标、提交、公布、跳过的中央展示。
- [ ] 调整 v2 配置弹窗视觉层级，模式选择保持主视觉。
- [ ] 运行客户端检查和构建，在 1280/1440/1920 浏览器验证控制、弹窗、发言和技能状态。
