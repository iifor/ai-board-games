# B 端后台管理架构

## 项目概述

B 端位于 `packages/admin`，面向运营、配置和调试人员，负责玩家、模型供应商、模型、音色、狼人杀角色/模式、皮肤、历史对局、AI 观测和工作流调试。服务端已提供跨游戏模式配置和审计 API；对应可视化页面是独立后续工作，不应继续把新游戏配置塞进狼人杀专页。

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

## 稳定目录边界

本节只记录 B 端后台长期稳定的职责边界，帮助判断改动应落在页面、管理资源、service、表单状态还是观测调试能力；具体文件位置、符号定义、调用方和影响面使用 CodeGraph 查询。

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
- `game-variants`（服务端契约已就绪）
- `audit-logs`（服务端只读查询契约已就绪）

### 跨游戏模式与审计边界

- `game-variants` 使用 `gameType + variantKey` 唯一标识，并绑定明确的 definition 版本与 config schema 版本。
- 更新必须提交当前 revision；并发编辑冲突返回 409，后台应刷新后让用户重新确认，不能静默覆盖。
- 删除操作只停用模式。历史对局保存 revision 和配置快照，因此停用或修改不影响历史回放。
- `audit-logs` 只读展示 actor、action、entity、requestId、before/after、IP、user-agent 和时间；没有修改或删除接口。

### 页面模块

- `Login`：登录后根据服务端 `mustChangePassword` 状态跳转。
- `ChangePassword`：首次登录时强制展示；改密成功后才允许进入后台页面。
- `Dashboard`：后台概览。
- `GameHistory`：历史对局列表和详情入口。
- `PlayerManager`：玩家资料、头像、人格、模型、音色、启用状态。主模型、备选模型、列表和
  调试弹窗的模型标签使用“名称（ID）”；展示名称为空或与 ID 相同时只显示 ID，避免空括号或重复内容。
- `ModelProviderManager`：模型供应商配置。
- `ModelManager`：供应商下模型配置。模型管理同时编辑“模型名称”和“模型 ID”，列表中分列
  显示，并可按任一字段搜索；模型名称是面向人的展示名称，模型 ID 保持为供应商请求使用的 ID。
  模型列表区分“已停用”和“额度已用完”，并按本地时区显示明确的 UTC 停用时间；额度耗尽模型只能由管理员手动恢复：后台先调用现有连接测试，只有 HTTP 成功且模型返回非空内容时，才通过现有模型更新接口启用并清除标记。
- `VoiceManager`：音色配置。
- `WerewolfRoleManager`：狼人杀角色管理。
- `WerewolfModeManager`：狼人杀模式和角色配置。

狼人杀模式的 `winCondition` 只允许 `side/gods/villagers/all`，分别对应屠边、屠神、屠民和屠城。历史 `single` 数据由服务端读取时兼容映射为 `side`，管理端不再提交 `single`。
- `SkinManager`：皮肤资源管理。
- `TraceExplorer`：AI trace、span、LLM 调用、agent 决策查看。
- `WorkflowDebugConsole`：工作流调试控制台，包含 match 事件、任务、pending action、effect、interrupt，以及狼人杀夜间结算 Shadow Audit 汇总。谁是卧底 match 仅在 `config.debugMode === true`、输入值仍等于已加载的 match ID 时显示专用控制；继续一步和连续运行适用于所有断点，跳过当前步骤仅在断点 payload 的 `stepType === 'undercover.speech'` 时显示。专用断点在通用 interrupt 表中不显示“通过/拒绝”，所有控制只提交已加载状态中当前待处理的真实断点 ID。
- 谁是卧底三项控制复用已鉴权的 `POST /api/admin/workflow/matches/:matchId/debug-control`，请求体固定为 `{ interruptId, action }`，`action` 只允许 `continue`、`skip`、`continuous`。服务端拒绝普通对局、非谁是卧底对局、缺失 match、缺失或旧断点、非当前 step 断点及重复操作；B 端不自行推导或缓存后续断点 ID。
- `WorkflowDebugConsole` 仅对已加载、输入框 ID 未变化且状态为 `completed`、`failed`、`paused_debug` 的 Match 开放“彻底删除对局数据”。用户必须在危险确认弹窗中重新输入完整 Match ID；活动 Match 保持禁用，服务端仍会再次校验状态。
- 删除成功后清空输入框、统计和调试 Tab，并展示实际删除的历史对局与 Trace 数量；删除失败时保留当前页面数据和错误信息。
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

首次部署在 `.env` 设置 `ADMIN_USERNAME=admin` 和不少于 12 字符的 `ADMIN_PASSWORD`。该账号只会在管理员表为空时创建一次；首次登录会被引导到改密页。已有管理员时，修改这两个环境变量不会覆盖任何账号。

## 扩展点与注意事项

- 新增后台页面放入 `src/pages/<PageName>`。
- 新增通用后台组件放入 `src/components` 或 `src/components/shared`。
- API 调用集中到 `services/adminApi.ts`，页面不要散落 fetch 细节。
- 页面只负责表单、交互、状态展示和调用 API；核心业务规则留在服务端。
## Werewolf 12-player expansion

- B-side werewolf role and mode management consume server-provided defaults, so `white_wolf_king` and `white-wolf-king-guard-12` should appear after seed upsert.
- Mode details for `guard-12` should show `预女猎守（12人）` with 12 players and the 4 wolf, 4 villager, seer, witch, hunter and guard lineup.
- Mode details for `white-wolf-king-guard-12` should show 12 players and the 3 normal wolf, 1 white wolf king, 4 villager, seer, witch, hunter and guard lineup.
- History/debug views should display `self-destruct` events with `targetId` when supplied, but must not implement independent death-chain or win-condition rules.

## 玩家备选模型

- 玩家管理支持为每个玩家配置一个可选 `fallbackModelId`，且不能与主模型相同。
- 玩家列表和调试弹窗同时展示主模型、备选模型；调试对话与正式游戏使用相同的降级规则。
- 首版不提供多级备选链、权重或手工切换。
