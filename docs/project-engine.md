# 引擎（packages/engine）

> 状态：P0 只有包骨架。P1 实现引擎核心与辩论赛，P2 补阶段栈与触发器并实现狼人杀标准局，届时补全本文档。

## 职责

- 定义 `GameSpec` 与 `defineGame` 等编写 API。
- 编译期校验 spec（阶段引用、可达性、模板变量与可见性）。
- 纯函数解释器 `advance(game, snapshot, input)`：推进流程，产出日志、StageEvent 与 AI 请求。
- 七种基础动作：`announce`、`speak`、`act`、`vote`、`judge`、`compute`、`reveal`。
- 提示词分层组装（L1–L6）、可见性过滤、输出校验与兜底、调试断点与确定性脚本。
- 内存测试夹具与性质检查（不泄露、必定终止、可复现）。

## 边界

- 不做任何 IO：不访问数据库、网络、文件、时钟；随机数只用种子 RNG。约束方式见 `project-summary.md` 的"纯度约束"。
- 只依赖 `zod` 与 `@battle/shared`。
- 游戏只能通过 `@battle/engine` 的公开 API 编写，不得引用引擎内部模块。
