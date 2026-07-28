# 移除狼人杀舞台行动状态行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从狼人杀 v2 的共享舞台中移除所有行动状态文字及其 `Activity` 图标。

**Architecture:** 直接修改上帝视角与玩家视角共用的 `InteractionStage`，删除状态行 JSX 和对应死样式；保留状态计算工具，因为其他单元测试仍覆盖其内部状态语义。

**Tech Stack:** React、TypeScript、CSS、Node.js test runner、pnpm

## Global Constraints

- 仅影响 C 端狼人杀 v2 舞台。
- 保留夜间提示、主标题、角色动画、行动关系和结果内容。
- 不新增组件、依赖、API、数据库结构或共享类型。

---

### Task 1: 删除共享舞台状态行

**Files:**
- Modify: `tests/unit/werewolfV2InteractionState.test.ts`
- Modify: `packages/client/src/features/werewolf-v2/components/PerspectiveShared/index.tsx`
- Modify: `packages/client/src/features/werewolf-v2/components/PerspectiveShared/index.css`

- [x] **Step 1: 增加最小回归检查**

在现有狼人杀 v2 单元测试中增加共享舞台源码契约，确保组件不再包含 `interaction-stage__status`、`Activity` 或 `getWerewolfInteractionStatusText`。

- [x] **Step 2: 运行检查并确认失败**

Run: `pnpm.cmd run test:unit -- werewolfV2InteractionState.test.ts`

Expected: FAIL，指出共享舞台仍包含状态行。

- [x] **Step 3: 删除最小生产代码**

删除 `InteractionStage` 中的状态行 JSX、`Activity` 图标导入和状态文案工具导入；删除 `.interaction-stage__status` 及只服务于它的色彩选择器。

- [x] **Step 4: 运行聚焦测试并确认通过**

Run: `pnpm.cmd run test:unit -- werewolfV2InteractionState.test.ts`

Expected: PASS。

- [x] **Step 5: 运行 C 端验证**

Run: `pnpm.cmd --filter @ai-presenter/client run check`

Run: `pnpm.cmd run build:client`

Expected: 两项均成功。
