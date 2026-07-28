# 隐藏狼人杀等待状态冗余提示

## 目标

狼人杀 v2 等待舞台处于 `idle` 状态时，不显示“等待行动”文字及其 `Activity` 图标。

## 边界

- 保留“天黑请闭眼”等夜间提示。
- 保留“等待下一阶段”等主标题。
- 保留非 `idle` 状态的“正在选择”“正在行动”“结果已公布”等过程反馈。
- 上帝视角和玩家视角同步生效，因为二者共用 `InteractionStage`。

## 实现

仅调整 `packages/client/src/features/werewolf-v2/components/PerspectiveShared/index.tsx` 中状态行的渲染条件；不新增组件，不修改服务端、API、数据库、共享类型或 CSS。

## 验证

- 增加一个最小回归检查，证明 `idle` 状态不渲染该状态行。
- 运行 C 端类型检查及相关单元测试。
