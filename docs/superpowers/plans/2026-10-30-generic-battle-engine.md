# 通用 AI 对战引擎实施计划

> 设计依据：`docs/superpowers/specs/2026-10-30-generic-battle-engine-design.md`。步骤使用 `- [ ]` 勾选跟踪。
> 本计划对 P0–P2 写到任务级；P3 起只写里程碑与验收，进入该阶段前再补任务级计划。

**目标**：在当前仓库内从零重建通用 AI 对战平台。首个可用版本（P6 结束）= **辩论赛**与**狼人杀标准 12 人局**可在 C 端实时观看与回放，可在 B 端配置模型和玩家、查看 Trace 与调试。阿瓦隆、谁是卧底不在本计划范围内。

**架构**：`packages/engine`（纯运行时）+ `packages/games`（游戏定义）+ `packages/server`（适配与 IO）+ `packages/client` / `packages/admin`（展示）+ `packages/shared`（协议）。

**技术栈**：pnpm 9.5 workspace（catalog）、TypeScript 7 strict、zod 4、vitest 5、React 19 + Vite 8、antd（仅后台）、Node 22 + Hono + Kysely（pg）、PostgreSQL 16。

## 全局约束

- 遵循 `CLAUDE.md`：分层、单一职责；前端组件文件不超过 200 行、后端/引擎文件不超过 250 行；类型放 `types.ts` 或 `shared`；禁止 `as any`。
- engine 不得 import `node:fs`、`node:net`、`pg`、`ws`，不得调用 `Date.now()`、`Math.random()`。随机只能用引擎 RNG，时间由输入提供。用测试扫描来强制。
- 规则函数必须是纯函数：只读 `ctx`，通过返回值写状态。`ctx` 在开发与测试环境下深度冻结。
- 游戏 spec 只能通过 engine 公开 API（`defineGame` 等）编写，不得 import engine 内部模块。
- 引擎能力按辩论赛和狼人杀的真实需要逐步加入，不为延后的游戏提前抽象。
- 每个阶段结束时同步更新 `docs/`，并保证 `pnpm check && pnpm test` 全绿。
- 只做加法：新代码不 import 旧代码。旧实现只通过 `legacy-final` tag 阅读参考。

## 仓库策略

- 当前 `master`（`88821d6`）打 tag `legacy-final` 并推送，作为唯一的旧实现参考点。需要时 `git worktree add ../ai-board-games-legacy legacy-final` 只读查看。
- 新开分支 `rewrite/battle-engine` 开发；P6 验收后合并回 `master`，替换旧实现。
- 清理既有 worktree `.worktrees/undercover-game`（分支 `codex/undercover-game`）：删除前先确认其中没有未合并的有用内容。

## 阶段总览

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| P0 脚手架 | 清空旧代码、新 workspace、工具链、CI、文档骨架 | `pnpm install && pnpm check && pnpm test` 通过（冒烟测试） |
| P1 引擎核心 + 辩论赛 | engine 主体 + 辩论赛在内存中跑通 | 辩论规则测试 + 三项性质测试通过；100 个种子全部正常终局 |
| P2 狼人杀标准局 | 阶段栈、触发器、加权投票等引擎扩展 + 标准 12 人局在内存中跑通 | 狼人杀规则测试 + 性质测试（重点是信息不泄露）通过；100 个种子全部正常终局 |
| P3 服务端基础 | 配置、迁移、错误处理、鉴权、供应商/模型/音色/玩家 CRUD | 集成测试覆盖 CRUD 与鉴权；API Key 加密存储，任何响应都不返回明文 |
| P4 对局运行时 | 事务推进、AI worker、LLM 适配、TTS、`ai_calls`、实时网关、回放、调试 API | 两个游戏的调试局经 WebSocket 跑到终局；真实模型各跑完 1 局；断线续播与回放测试通过 |
| P5 C 端 | 大厅、GameStage（`versus` + `circle` 布局）、播放、历史与回放 | 浏览器中观看两个游戏的实时局与回放，字幕和语音正常 |
| P6 B 端 | 登录、资源管理、对局列表、Trace 分层查看、调试台 | 后台完成一次"配置模型 → 建玩家 → 开调试局 → 单步 → 看 Trace"；**合并到 master** |
| P7 狼人杀板子 | 按 `docs/references/werewolf-boards.md` 分批补角色与 variant | 每批的规则测试 + 性质测试通过 |
| P8 部署 | Dockerfile、compose（postgres/app/nginx）、启动迁移、CI 发布验证 | 在全新服务器上按文档一条命令部署成功 |

---

## P0 脚手架

### 保留与删除

保留：`.git`、`.github/`（重写 workflow）、`.claude/`、`.codex/`、`.codegraph/`、`.gitattributes`、`CLAUDE.md`、`AGENTS.md`、`docs/superpowers/specs/2026-10-30-*`、`docs/superpowers/plans/2026-10-30-*`。
移动：`狼人杀玩法.md` → `docs/references/werewolf-boards.md`（P7 板子规则来源）。
删除：其余全部，包括 `packages/`、`tests/`、`scripts/`、`nginx/`、`Dockerfile`、各 compose 文件、`docs/` 其余内容、`TODO.md`、`design-qa.md`、`run-web.cmd`、`README.md`（重写）。被 gitignore 的本地目录（`data/`、`tmp/`、`artifacts/`、`dist/`、`node_modules/`、`.pnpm-store/`、`.npm-cache/`）由开发者自行处理，不纳入提交。

### 任务

- [x] **P0-1 打 tag 与开分支**：`git tag legacy-final 88821d6 && git push origin legacy-final`；`git switch -c rewrite/battle-engine`。
- [x] **P0-2 清空**：按上面的清单删除和移动，单独提交 `chore: remove legacy implementation`。
- [x] **P0-3 根配置**：`package.json`（脚本：`dev`、`build`、`check`、`test`、`test:watch`、`db:up`、`db:down`）、`pnpm-workspace.yaml`、`tsconfig.base.json`（strict、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`）、`vitest.config.ts`（vitest 5 用 `test.projects` 取代 workspace 文件）、`.gitignore`（删掉现有的 `superpowers/` 规则：它会让 `docs/superpowers/` 下新增的设计与计划文档被忽略）、`.env.example`、`docker-compose.dev.yml`（只有 PostgreSQL 16，绑定 `127.0.0.1`）。
- [x] **P0-4 包骨架**：`shared`、`engine`、`games`、`server`、`client`、`admin` 各自的 `package.json`、`tsconfig.json`、`src/index.ts`、一条冒烟测试；包名 `@battle/<name>`。
- [x] **P0-5 引擎纯度检查**：类型层（engine/games/shared 的 `tsconfig.json` 用 `types: []`）+ 测试层（`packages/engine/test/purity.test.ts` 扫描 engine 与 games 源码的依赖白名单和禁用调用）。
- [x] **P0-6 CI**：`.github/workflows/ci.yml`：PR 与 push 时执行 install、check、test（PostgreSQL service 从 P3 开始启用）。
- [x] **P0-7 文档骨架**：重写 `docs/README.md`、`project-summary.md`，新增 `project-engine.md`（取代旧的 `project-workflow.md` 与 `project-prompts.md`），以及 `project-server.md`、`project-client.md`、`project-admin.md`、`project-shared.md` 空壳；同步更新 `CLAUDE.md`、`AGENTS.md` 中的文档路由。
- [x] **P0-8 验收**：`pnpm install && pnpm check && pnpm test` 通过；提交 `chore: scaffold battle engine workspace`。

---

## P1 引擎核心 + 辩论赛

### 文件清单（`packages/engine/src`）

| 文件 | 职责 |
| --- | --- |
| `index.ts` | 公开 API 出口 |
| `spec/types.ts` | `GameSpec`、各 kind 的 `PhaseSpec`、`RoleSpec`、`StateSpec`、`PresentationSpec`、`BudgetSpec` |
| `spec/define.ts` | `defineGame`、`definePrompts`、`speechOutput`：只做类型推断与模板解析 |
| `compiler/compile.ts` | spec → `CompiledGame`：填默认值、阶段引用与可达性校验、计算 `specHash` |
| `compiler/checkTemplates.ts` | 用调试夹具渲染全部模板，校验变量存在且可见 |
| `runtime/types.ts` | `EngineSnapshot`、`EngineInput`、`AdvanceResult`、`AiRequest`、`LogEntry` |
| `runtime/advance.ts` | 主循环：当前阶段 → 执行 → 跳转 / 预算 / 终局，直到阻塞 |
| `runtime/setup.ts` | 开局参数校验、座位绑定、角色与席位分配、`init` 规则 |
| `runtime/context.ts` | 构造只读 `ctx` |
| `runtime/seats.ts` | `SeatQuery`：`alive`、`withRole`、`inTeam`、`position`、`except`、`ids`、`count` |
| `runtime/transitions.ts` | `next` 求值、`round` 递增、阶段访问计数 |
| `runtime/budget.ts` | 轮次 / 访问 / 调用 / token 计数与超限终局 |
| `runtime/rng.ts` | 种子 RNG（splitmix32），按 `phase:visit:purpose` 派生 |
| `runtime/log.ts` | 日志追加，带频道 |
| `phases/registry.ts` | kind → 执行器映射 |
| `phases/announce.ts` `speak.ts` `act.ts` `vote.ts` `judge.ts` `compute.ts` `reveal.ts` | 七种基础动作执行器 |
| `phases/tally.ts` | 计票与平票策略 |
| `ai/pipeline.ts` | 输出解析、合法性、内容校验、重试请求、兜底 |
| `ai/outputContract.ts` | 用 zod 4 的 `z.toJSONSchema` 生成 JSON Schema 与 L6 文案 |
| `prompt/template.ts` | 渲染器：`{{path}}`、`{{#each}}`、`{{#if}}`；渲染时报告未知变量 |
| `prompt/visibleContext.ts` | 按座位可见范围生成模板上下文 |
| `prompt/history.ts` | L4：频道过滤、最近 N 条 + 摘要占位 |
| `prompt/assemble.ts` | L1–L6 组装，输出分层结构 |
| `visibility/channels.ts` | 频道成员判断 |
| `visibility/audienceView.ts` | 观众视图投影与二次过滤 |
| `presentation/stageEvents.ts` | 日志 → `StageEvent` |
| `debug/breakpoints.ts` | 断点判断与调试指令（继续、单步、跳过、连续运行） |
| `debug/scriptedAgent.ts` | 按种子与 `debug` 脚本生成确定性合法输出 |
| `testing/harness.ts` | `runToEnd(game, { seed, params, agent, maxSteps })`：内存驱动一整局 |
| `testing/properties.ts` | `assertNoLeak`、`assertTerminates`、`assertDeterministic` |

`packages/shared/src`：`stage.ts`（StageEvent 联合类型、观众视图）、`catalog.ts`（游戏目录 DTO）。

> 实现后的文件划分与上表略有不同（以代码为准）：`runtime/transitions.ts` 与 `stack` 相关逻辑合并为 `runtime/flow.ts`；新增 `runtime/env.ts`（执行环境）、`runtime/input.ts`（输入分发）、`runtime/labels.ts`；announce/compute/reveal 合并为 `phases/simple.ts`；可见性拆为 `visibility/roles.ts`、`visibility/stateProjection.ts`；指纹在 `compiler/specHash.ts`；AI 请求登记在 `ai/requests.ts`。

### 核心类型（定稿以实现为准）

```ts
interface EngineSnapshot {
  gameKey: string; specVersion: number; specHash: string; variantKey?: string;
  seed: number; params: unknown; status: 'running' | 'waiting_ai' | 'paused' | 'completed';
  seats: Seat[]; state: unknown; round: number;
  cursor: { phaseId: string; stack: string[]; visits: Record<string, number>; phaseState: unknown };
  log: LogEntry[]; pending: AiRequest[]; budgetUsed: BudgetUsage; result?: GameResult;
}
type EngineInput =
  | { kind: 'start' }
  | { kind: 'ai_result'; requestId: string; output: unknown; usage?: TokenUsage }
  | { kind: 'debug'; command: DebugCommand };
interface AdvanceResult {
  snapshot: EngineSnapshot; log: LogEntry[]; stageEvents: StageEvent[];
  aiRequests: AiRequest[]; status: EngineSnapshot['status'];
}
interface AiRequest {
  id: string; seat: number; phaseId: string; action: 'speak' | 'act' | 'vote' | 'judge';
  prompt: PromptLayers; outputSchema: JsonSchema; legalTargets?: number[]; attempt: number;
}
```

`cursor.stack` 在 P1 中始终为空，类型先留出位置，P2 启用。

### 任务（每项都先写测试）

- [x] **P1-1 基础类型与工具**：`spec/types.ts`、`spec/define.ts`、`runtime/rng.ts`、`runtime/seats.ts`、`runtime/context.ts`。测试：同一种子产生同一序列，派生出的子序列互不相关；座位查询（含 `position`）组合正确；冻结后的 `ctx` 被写入时抛错。
- [x] **P1-2 编译器**：`compile.ts`。测试：引用不存在的阶段、存在不可达阶段、人数范围与角色分配矛盾，均报出带路径的错误；`specHash` 稳定。
- [x] **P1-3 主循环（不含 AI）**：`advance.ts`、`setup.ts`、`transitions.ts`、`budget.ts`、`log.ts`、`announce.ts`、`compute.ts`。测试：只含 announce/compute 的示例游戏能循环 N 轮后终局；`maxVisits` 与 `maxRounds` 超限按 budget 终局；`start` 输入只接受一次；`params` 校验失败拒绝开局。
- [x] **P1-4 提示词**：`template.ts`、`visibleContext.ts`、`history.ts`、`assemble.ts`、`outputContract.ts`、`checkTemplates.ts`。测试：三种语法；未知变量报错；`ownerOnly`、`team`、`host` 字段对其他座位不可见；L4 只含可见频道；L6 含合法目标。
- [x] **P1-5 AI 动作**：`pipeline.ts`、`speak.ts`、`act.ts`、`vote.ts`、`tally.ts`、`judge.ts`、`reveal.ts`。测试：顺序发言一次只发一个请求，后发言者能看到前面的发言；并行动作一次发出全部请求；非法 JSON、非法目标、内容违规各自触发重试，再失败走兜底并留痕；平票按策略处理，种子随机结果稳定；`judge` 多数汇总与平局；重复或过期的 `requestId` 被拒绝。
- [x] **P1-6 可见性与舞台事件**：`channels.ts`、`audienceView.ts`、`stageEvents.ts`。测试：`public` 视角的事件不含私密内容；`omniscient` 视角包含；终局 `revealOnEnd` 生效。用一个带私密频道的合成示例游戏覆盖（辩论赛本身没有隐藏信息）。
- [x] **P1-7 调试**：`breakpoints.ts`、`scriptedAgent.ts`。测试：断点暂停、单步、跳过、连续运行；脚本化输出必定合法。
- [x] **P1-8 测试夹具与性质检查**：`harness.ts`、`properties.ts`。测试：对合成示例游戏运行三项性质检查。
- [x] **P1-9 辩论赛**：`packages/games/src/debate/{spec,rules,prompts,topics,debug}.ts` 与 `debate.test.ts`，以及 `packages/games/src/index.ts` 注册表。规则测试：
  - 9–12 人开局；正反方各 4 人席位正确，其余为评委；少于 9 人拒绝开局。
  - 发言顺序：立论正一、反一 → 四组攻辩一问一答交替 → 总结反四、正四。
  - 指定辩题时使用该辩题；不指定时同一种子抽到同一辩题。
  - 评委多数决定胜方，票数相同记为平局；评委输出非法时重试，再失败走兜底并留痕。
  - MVP 只能从辩手中选，结果写入终局。
  - 性质测试：100 个种子全部终止、可复现。
- [x] **P1-10 文档**：完成 `docs/project-engine.md`（spec 写法、基础动作、提示词分层、可见性、调试、如何新增一个游戏）。
- [x] **P1-11 验收与提交**：`pnpm check && pnpm test` 全绿；按任务分别提交。

---

## P2 狼人杀标准 12 人局

### 新增引擎能力

| 文件 | 职责 |
| --- | --- |
| `runtime/stack.ts` | 阶段栈与 `return` |
| `runtime/triggers.ts` | 事件匹配、`push` 压栈、`jump` 清栈跳转、深度上限 |
| `ai/declaredActions.ts` | 输出 schema 中的可选附加动作（如自爆）：权限校验后派发 `action_declared` |
| `phases/vote.ts`（扩展） | `weight`、投票者动态排除 |
| `phases/act.ts`（扩展） | `allowNone` |
| `compiler/compile.ts`（扩展） | `return` 只能出现在可被压栈的阶段；触发器引用校验 |

### 游戏文件（`packages/games/src/werewolf/`）

| 文件 | 职责 |
| --- | --- |
| `spec.ts` | 组合各环节阶段与触发器，`variants` 只含 `standard-12` |
| `state.ts` | 状态 schema 与可见性：刀口、药剂、查验记录、警长、白痴翻牌、发言方向 |
| `phases/night.ts` | 狼人夜聊与投票、预言家、女巫、夜晚结算 |
| `phases/sheriff.ts` | 报名、竞选发言、退水、投票、复投、警长决定发言方向 |
| `phases/day.ts` | 公布死讯、白天发言、放逐投票 |
| `phases/postgame.ts` | MVP 投票、赛后发言 |
| `triggers.ts` | 遗言、猎人开枪、警徽移交、自爆 |
| `rules/*.ts` | 纯函数：`resolveNight`、`witchOptions`、`speechOrder`、`exileResult`、`checkWinner` 等，每个文件一个主题 |
| `prompts/*.ts` | 规则说明、角色身份、各阶段指令模板 |
| `debug.ts` | 确定性脚本（可指定身份分配、各动作输出） |
| `*.test.ts` | 按环节拆分的规则测试 |

> 实现后的划分（以代码为准）：引擎新增 `runtime/triggers.ts`、`compiler/graph.ts`、`ai/declarations.ts`，阶段栈逻辑在 `runtime/flow.ts`；`stack.ts` 未单独拆出。狼人杀规则拆为 `rules/{context,night,sheriff,day,death,victory,postgame}.ts`，阶段拆为 `phases/{night,sheriff,day,death,postgame}.ts`；测试放在 `packages/games/test/werewolf/`。规则口径参照旧实现后有所调整：放逐平票不 PK、狼人不能刀狼人、只能在白天发言中自爆，详见 `docs/games/werewolf.md`。

### 任务（每项都先写测试）

- [x] **P2-1 阶段栈与触发器**：`stack.ts`、`triggers.ts`。测试：`push` 执行后回到原位置；触发器内再触发；`jump` 清空栈并跳转；超过深度上限按预算终局。
- [x] **P2-2 附加动作、加权投票、可放弃**：`declaredActions.ts`、`vote.ts`、`act.ts` 扩展。测试：无权座位声明的附加动作被拒绝并留痕；1.5 票权重计票正确；被排除的投票者不会收到请求；`allowNone` 时放弃是合法输出。
- [x] **P2-3 开局与状态**：`state.ts`、spec 骨架。测试：12 人身份分配符合 4 狼 + 预女猎白 + 4 民且由种子决定；狼人能看到队友，其他人看不到任何人的身份。
- [x] **P2-4 夜晚**：`phases/night.ts`、`rules/resolveNight` 等。测试：狼人夜聊只出现在 `team:wolf`；狼人内部平票按策略处理；查验结果只进预言家的私密日志；女巫只在当夜看到刀口；解药、毒药各只能用一次，用完后不再出现在合法选项里；首夜能否自救按规则参数处理；结算后死亡名单正确。
- [x] **P2-5 警长与白天**：`phases/sheriff.ts`、`phases/day.ts`。测试：竞选报名、退水、投票、复投完整流程；无人竞选时无警长；警长 1.5 票生效；发言方向由警长决定；白痴被放逐时翻牌存活并失去投票权。
- [x] **P2-6 触发器**：`triggers.ts`。测试：首夜与放逐死亡的遗言规则；猎人被刀能开枪、被毒不能开枪；警长死亡时移交或撕毁警徽；狼人白天自爆后立即入夜，当天放逐取消。
- [x] **P2-7 胜负与赛后**：`rules/checkWinner`、`phases/postgame.ts`。测试：神职全灭、村民全灭、狼人全灭三种终局；每次死亡后都检查胜负；赛后 MVP 投票与发言。
- [x] **P2-8 性质测试**：100 个种子全部终止、可复现；泄露检查覆盖狼队频道、查验结果、女巫刀口信息、身份字段，确认非授权座位的 prompt 与 `public` 视角事件中都不出现这些内容。
- [x] **P2-9 文档**：在 `docs/project-engine.md` 补充阶段栈、触发器、附加动作；新增 `docs/games/werewolf.md`，记录标准局的规则口径（首夜自救、遗言、警徽等判定）。
- [x] **P2-10 验收与提交**：`pnpm check && pnpm test` 全绿；按任务分别提交。

### P1–P2 风险与对策

- **spec 写不干净辩论赛或狼人杀** → 这正是对设计的检验：先回到设计文档调整基础动作或上下文，不要在 spec 里加特例开关。
- **类型推断过于复杂**（如阶段 ID 的字面量推断）→ 推断做不到的部分交给编译期校验，不为类型体操牺牲可读性。
- **模板渲染器范围膨胀** → 只支持三种语法；需要更多逻辑时，在规则函数里预先算好变量。
- **狼人杀规则口径不清**（首夜自救、遗言范围、警徽规则）→ 以旧实现的行为为默认值，口径写进 `docs/games/werewolf.md` 并用测试固定。

---

## P3–P8 里程碑要点

### P3 服务端基础（已完成）

> 实现说明：前后端契约改为 `@battle/shared` 中显式的 DTO 类型 + 服务端 `satisfies` 绑定的 zod schema，不使用 `hono/client` 推断；资源模块共用 `utils/crud.ts`；本机开发端口改为 API 3100、数据库 5433（避开本机已占用端口）。

`server/src/{config, db, middlewares, utils, modules}`；HTTP 与 WebSocket 用 Hono（`@hono/node-server`），参数校验用 zod 中间件，client/admin 通过 `hono/client` 获得类型化 API；数据库访问用 Kysely。模块按 `controller / service / repository / routes / validator / types` 分层。`db/migrations/001_init.sql` 建全部表；启动时执行迁移，失败则拒绝启动。统一错误响应 `{ code, message, data? }`，不暴露内部错误。模块：`auth`（JWT、首次登录改密）、`providers`（API Key 用 AES-GCM 加密，响应只返回掩码）、`models`、`voices`、`players`。

### P4 对局运行时（已完成）

> 实现说明：Azure 语音改用 REST 接口（不引入 SDK）；音频存于 `media_assets`（bytea）；调试与脚本化拆成 `debug`（断点）与 `scripted`（不调用模型）两个开关；`pacing` 区分按确认节奏推进与不等待。

模块：`games`（目录接口，来自注册表）、`matches`（创建 / 列表 / 详情 / 删除）、`match-runtime`（事务内调用 `advance`，写快照、任务、事件）、`ai-worker`（`SKIP LOCKED` 领取、传输层重试、备用模型、写 `ai_calls`）、`llm`（OpenAI 兼容客户端与 JSON 修复）、`tts`（Azure / Mimo，带缓存）、`realtime`（WebSocket：start / ack / pause / resume，`prefetch` 窗口，断线续播）、`debug`（调试指令接口，仅后台可用）。

### P5 C 端（已完成）

> 实现说明：路由用 react-router 7；暂停语义为不再开始新的事件（不打断当前事件）；`.claude/launch.json` 提供 server / client / admin 三个本地启动配置。

`client/src/features/{lobby, game-stage, history}`；GameStage 包含 `versus`（辩论）与 `circle`（狼人杀）两种布局、`useMatchStream`、`usePlayback`、字幕与音频组件、专用组件注册表（警徽、昼夜指示）；`services/` 封装 REST 调用。

### P6 B 端（已完成）

> 实现说明：新增 `GET /api/admin/games/:key/phases` 供阶段图使用；登录后的页面未做浏览器端到端测试（本地验证时读取测试令牌的操作被权限策略拒绝），由类型检查、组件测试与服务端集成测试覆盖。

`admin/src/features/{auth, providers, models, voices, players, matches, traces, debug-console}`；Trace 按 L1–L6 分层展示，并支持按兜底原因筛选；调试台根据 `CompiledGame` 的阶段图展示当前位置与断点。验收后把 `rewrite/battle-engine` 合并到 `master`。

### P7–P8

- P7：狼人杀板子按批次补；特殊角色拆成 `games/werewolf/special/<role>.ts`；每批先补规则口径文档再写测试。进度：
  - [x] 框架：引擎变体、阶段 `enabled`、`reassign`；板子注册表、角色目录、夜晚/白天顺序表；白狼王&守卫样板板子。
  - [x] 第一批 2–10 号（混血儿、禁言长老、骑士、潜行者、花蝴蝶、狼美人、恶魔、恶灵骑士、梦魇）。
  - [x] 第二批 11–19 号（老流氓、狼王、摄梦人、魔术师、大灰狼、占卜师、隐狼、乌鸦、驯熊师、野孩子、炸弹人、九尾狐）。
  - [x] 第三批 20–27 号（黑商、大树、狼兄弟、熊、企鹅、狐狸、种狼、天眼、祈求者、盗贼、丘比特、魅魔、鬼魂新娘；引擎新增 `setup.deal`）。
  - [x] 第四批 28、30–32 号（树苗与火力全开的隐狼、魔狼、猎魔人、灵狼、狼巫、幻术师；29 号规则只写了"略"，没有可执行规则，跳过）。
- P8：多阶段构建的 Dockerfile、compose（postgres 私网 + app + nginx）、`.env` 说明、CI 发布验证、部署文档。
