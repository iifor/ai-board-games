# 辩论赛 v2 玩家间距优化

## 目标

在不改变玩家卡尺寸、阵营侧栏宽度和业务组件的前提下，缓解左右两侧四名辩手纵向排列过密的问题。

## 设计

- 仅修改 `packages/client/src/features/debate-v2/DebateGameV2/index.css`。
- 将 `.debate-shell--v2 .debate-seat-list` 的纵向间距从固定 `8px` 调整为响应式 `clamp(16px, 2vh, 20px)`。
- classic 辩论赛、设置弹窗、评委席和移动端双列结构保持不变。
- 不修改卡片高度、头像尺寸、组件结构、API、数据库或共享类型。

## 验收

- 1280×720 下四张玩家卡完整可见，无纵向溢出。
- 更高桌面视口下间距最多为 20px，不出现过度分散。
- 左右阵营间距一致。
- 客户端类型检查、生产构建和 `git diff --check` 通过。
