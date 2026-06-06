# B 端后台管理架构

## 项目概述

B 端位于 `packages/admin`，面向运营、配置和调试人员，负责玩家、模型供应商、模型、音色、狼人杀角色/模式、皮肤、历史对局、AI 观测和工作流调试。

## 技术栈

- React 18
- React DOM
- React Router
- Vite
- TypeScript
- Ant Design
- @ant-design/icons
- @uiw/react-json-view
- `@ai-presenter/shared`

## 目录结构

```txt
packages/admin/
├── package.json
├── tsconfig.json
├── vite.config.mjs
└── src/
    ├── main.tsx
    ├── components/
    │   ├── AdminPage/
    │   ├── GameDetailDrawer/
    │   ├── TraceComponents/
    │   └── shared/
    ├── constants/
    │   ├── adminConstants.ts
    │   └── traceLabels.ts
    ├── hooks/
    │   └── usePlayerNicknames.ts
    ├── pages/
    │   ├── Dashboard/
    │   ├── GameHistory/
    │   ├── ModelManager/
    │   ├── ModelProviderManager/
    │   ├── PlayerManager/
    │   ├── SkinManager/
    │   ├── TraceExplorer/
    │   ├── VoiceManager/
    │   ├── WerewolfModeManager/
    │   ├── WerewolfRoleManager/
    │   └── WorkflowDebugConsole/
    ├── services/
    │   └── adminApi.ts
    ├── types/
    ├── utils/
    └── styles.css
```

## 架构设计

后台以 `AdminPage` 为主框架，使用 React Router 管理后台路由。页面模块通过 `services/adminApi.ts` 调用 `/api/admin/*`，服务端资源模块负责最终参数校验、权限边界、数据读写和错误处理。

后台主要职责：

- 配置类：玩家、模型供应商、模型、音色、狼人杀角色和模式、皮肤。
- 历史类：辩论赛、狼人杀、旧共识迷图历史和详情。
- 观测类：trace、LLM 请求、agent 决策、span 时间线。
- 调试类：工作流 match、tick、pending action、AI task、interrupt。
- 记忆类：狼人杀、辩论赛及全部游戏的长期玩家画像统计与清除。

## 核心模块

### AdminPage

- 后台主布局和导航入口。
- 管理后台路由组合。
- 连接各管理页面。

### adminApi

`packages/admin/src/services/adminApi.ts` 统一封装后台 API 请求，覆盖：

- `players`
- `model-providers`
- `models`
- `voices`
- `werewolf-config`
- `games`
- `skins`
- `upload`
- `settings`
- `observability`
- `workflow-engine`
- `player-memories`

### 页面模块

- `Dashboard`：后台概览。
- `GameHistory`：历史对局列表和详情入口。
- `PlayerManager`：玩家资料、头像、人格、模型、音色、启用状态。
- `ModelProviderManager`：模型供应商配置。
- `ModelManager`：供应商下模型配置。
- `VoiceManager`：音色配置。
- `WerewolfRoleManager`：狼人杀角色管理。
- `WerewolfModeManager`：狼人杀模式和角色配置。

狼人杀模式的 `winCondition` 只允许 `side/gods/villagers/all`，分别对应屠边、屠神、屠民和屠城。历史 `single` 数据由服务端读取时兼容映射为 `side`，管理端不再提交 `single`。
- `SkinManager`：皮肤资源管理。
- `TraceExplorer`：AI trace、span、LLM 调用、agent 决策查看。
- `WorkflowDebugConsole`：工作流调试控制台，包含 match 事件、任务、pending action、effect、interrupt，以及狼人杀夜间结算 Shadow Audit 汇总。
- `MemoryManager`：展示分游戏长期画像数量和最后更新时间，提供狼人杀、辩论赛、全部游戏三个危险清除操作。确认弹窗明确删除条数和不受影响的数据范围。

### 观测组件

`TraceComponents` 提供 trace 相关展示组件：

- `AgentDecisionCard`
- `LlmCallCard`
- `SpanTimeline`

`TraceExplorer` 会识别 `werewolf_interaction_feedback` 事件，并在时间线中展示狼人杀角色交互反馈，例如预言家查验、守卫守护、女巫用药和猎人开枪。该事件可能包含私密角色信息，只用于 B 端调试观测。

Trace 详情页提供“关键事件”筛选入口，聚合狼人杀交互反馈、AI error 和 fallback 决策，便于快速排查行动反馈与异常路径。

## 配置与部署

常用命令：

```bash
pnpm run dev:admin
pnpm run build:admin
pnpm run check:admin
```

构建产物输出到 `dist/admin`，由服务端挂载到 `/admin`。`dist/` 不作为源码目录维护。

## 扩展点与注意事项

- 新增后台页面放入 `src/pages/<PageName>`。
- 新增通用后台组件放入 `src/components` 或 `src/components/shared`。
- API 调用集中到 `services/adminApi.ts`，页面不要散落 fetch 细节。
- 页面只负责表单、交互、状态展示和调用 API；核心业务规则留在服务端。
