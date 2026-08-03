# 谁是卧底完整调试模式设计

## 目标

为 `/game/v2/undercover` 增加一套完整但严格限域的调试模式，同时覆盖：

- 加速调试：C 端可选择 `1× / 2× / 4×` 浏览器语音和 ACK 推进速度。
- 流程调试：谁是卧底工作流在关键阶段前暂停，由 B 端继续一步、跳过当前步骤或切换为连续运行。
- AI/TTS 绕过：调试局使用确定性台词与投票，不调用真实模型或云端 TTS。

经典路由 `/games/undercover` 保持现状。普通对局不得进入任何调试分支。

## 第一性约束

1. 调试能力必须由服务端执行和校验，C 端不能决定合法投票、工作流步骤或比赛结果。
2. 继续复用现有 `debugMode: boolean`，不新增可任意组合的 `debugConfig`，避免扩大公开 WebSocket 协议。
3. 不建立跨游戏调试框架；只补齐谁是卧底当前明确需要的能力。
4. 正常断点不能复用错误终态 `paused_debug`。`paused_debug` 继续只表示 AI 任务或推进失败后的诊断状态。
5. 调试局不保存为正式历史对局，也不生成正式 AI trace。
6. 调试数据不得泄漏平民词、卧底词、玩家私词或卧底身份；秘密仅在正常终局公开投影中揭示。

## 现有结构判断

本功能跨越四个既有边界：

- C 端：谁是卧底 V2 容器、控制栏、共享 WebSocket session hook 和浏览器语音队列。
- 服务端：谁是卧底 workflow/handler、game-socket runner 和 workflow-engine。
- B 端：现有 Workflow Debug Console 及其管理 API service。
- 文档与测试：客户端、工作流、管理端文档，以及 unit/workflow 测试。

现有 `debugMode` 已由狼人杀开局配置传入 game-socket；game-socket 会在调试模式下跳过缺失模型密钥检查，并禁止调试局写入正式历史。谁是卧底 runtime 已支持固定 seed、固定词对和固定卧底玩家，但其 AI task 仍会调用真实模型，也没有正常的步骤断点控制。

## 方案选择

采用“复用现有布尔调试开关”的最小方案：

- `debugMode: true` 对谁是卧底表示启用全部已确认调试能力。
- 不允许客户端分别关闭安全校验、固定投票或服务端断点。
- C 端负责启动调试局、显示 Match ID、播放速度和播放控制。
- B 端负责受鉴权保护的工作流继续、跳过和连续运行。

未采用以下方案：

- `debugConfig`：会扩大 WebSocket schema、前端表单和组合测试矩阵。
- 跨游戏通用调试框架：狼人杀和辩论赛尚未形成相同的断点及 AI 绕过契约。

## C 端交互

### 开局

仅 V2 开局区显示“调试模式”开关。开启后开始按钮发出的现有 WebSocket `start` 消息携带：

```ts
{
  type: 'start';
  mode: 'real';
  gameType: 'undercover';
  playerIds: number[];
  debugMode: true;
}
```

不开启时不传或传 `false`，行为与当前普通局一致。

### 对局中

调试局显示：

- “调试中”状态标记。
- 当前 Match ID，可直接复制到 B 端 Workflow Debug Console。
- `1× / 2× / 4×` 速度选择，默认 `2×`。

速度只影响调试局：

- 浏览器 `SpeechSynthesisUtterance.rate`。
- 无语音或浏览器语音失败时的 ACK 等待时间。

速度不改变服务端规则、随机种子、步骤顺序或投票结果。

### 播放失败

浏览器没有语音能力、语音报错或用户关闭语音时：

- 字幕继续展示。
- 按当前倍率使用有上限的短 ACK 延迟。
- 不请求云端 TTS。

## AI 与 TTS 绕过

新增谁是卧底专用确定性生成器，职责仅包含：

- `buildDebugSpeech(state, actorId)`：根据 seed、round、actorId 和玩家身份选择固定描述模板。
- `buildDebugVote(state, actorId, legalIds, runoff)`：只从 handler 提供的合法目标集合中确定性选择。

调试 handler 必须先检查服务端 match config 中的 `debugMode`，不能信任事件或客户端派生状态。

确定性台词仍经过：

- `undercoverSpeechSchema`
- `validatePublicSpeech`

确定性投票仍经过：

- `undercoverVoteSchema`
- `legalIds.includes(targetId)`

若固定台词未通过秘密泄漏校验，使用现有安全兜底文本；不得回退到真实模型。若合法投票目标为空，沿用现有步骤跳过逻辑。

调试事件继续使用现有 `presentation.speakableText`、公开 game 投影和 ACK 管线。服务端不生成 `audioUrl`，因此 C 端自然回退到浏览器语音。

## 关键阶段断点

调试局在以下步骤执行前暂停一次：

- 每轮 `round_start`
- 每位玩家 `speech`
- 普通投票和复投 `vote`
- 淘汰结算 `resolve`
- 最终结果 `result`

`setup` 不设人工断点，以确保 C 端能够立即收到可识别的 match 和初始公开状态。

### 断点表示

复用现有 `workflow_interrupts`：

- `interruptType = 'undercover_debug_breakpoint'`
- `stepId` 为将要执行的当前步骤。
- `payload` 只包含公开调试信息，例如步骤名称、轮次和类型。

同一 match、同一 step 只创建一个断点。已解除的断点不会在 AI task 完成后重新创建。

### tick 门控

workflow tick 只在以下条件同时成立时检查断点：

- `match.gameType === 'undercover'`
- `match.config.debugMode === true`
- `match.config.debugRunMode !== 'continuous'`
- 当前步骤属于关键阶段

若当前步骤没有断点记录，则创建 pending interrupt 并停止本次 tick；若断点仍 pending，则保持等待；若已 resolved，则正常执行；若以 skipped 方式解决，则记录系统级 `step_skipped` 并安全前移步骤索引。

该门控不改变 `paused_debug` 含义，也不影响任何普通局或其他游戏。

## B 端控制

在现有 Workflow Debug Console 中复用 Match ID 加载流程，增加：

- **继续一步**：将当前 pending breakpoint 标记为 resolved，然后唤醒一次 tick。
- **跳过当前步骤**：将当前 breakpoint 标记为 skipped，由 tick 记录 `step_skipped` 并移动到下一个步骤。
- **连续运行**：将 match config 中 `debugRunMode` 设为 `continuous`，解除当前 breakpoint，并继续运行到完成或真实错误。

所有控制 API 必须经过现有管理端鉴权，并在 service 层校验：

- match 存在。
- `gameType === 'undercover'`。
- `config.debugMode === true`。
- 操作目标是当前步骤的 pending breakpoint。

控制普通局、历史回放、非当前步骤、重复提交或不存在的 match 时返回明确错误，不返回假成功。

## Match ID 与连接生命周期

谁是卧底 runtime 创建 match 后，首个公开投影包含现有 `game.id`。C 端从真实服务端事件读取并显示，不由客户端生成。

C 端断开时：

- pending breakpoint 保持不变。
- 服务端不得自动切换连续运行。
- B 端仍可查看调试状态，但若继续后没有 C 端消费 ACK，播放管线按现有 session 取消规则结束，不伪造正式对局完成。

## 持久化与清理

- 断点、步骤状态和 `debugRunMode` 使用现有 match、workflow event、interrupt 和 `config_json` 存储，不新增数据库表或迁移。
- 调试局不调用正式 `saveGameRecord`。
- 调试局不创建正式 Undercover trace。
- 调试 match 继续使用现有终态保留与清理策略，便于短期诊断。

## 文件职责

### 新增

- `packages/server/modules/undercover/debug.ts`
  - 确定性台词与投票。
  - 不访问数据库、WebSocket 或前端状态。
- `packages/server/modules/workflow-engine/debugBreakpoint.ts`
  - 断点查询、创建、解除和跳过判定。
  - 不包含谁是卧底游戏规则。

### 修改

- 谁是卧底 V2 容器和控制栏
  - 调试开关、Match ID、倍率交互与布局。
- `useUndercoverGame`
  - 传递 `debugMode`，维护调试标记和播放倍率。
- 客户端 speech 类型与 browser speech helper
  - 增加可选倍率；默认值保持 `1`。
- 谁是卧底 workflow 和 handlers
  - 保存调试配置，调试 AI task 使用确定性生成器。
- workflow tick/service/controller/routes
  - 调试断点门控以及管理端控制 API。
- B 端 admin API service 和 Workflow Debug Console
  - 调用控制 API 并展示操作结果。
- `docs/project-workflow.md`
  - 记录断点、确定性任务、持久化和错误状态边界。
- `docs/project-client.md`
  - 记录 V2 调试开关、Match ID、浏览器语音和倍率。
- `docs/project-admin.md`
  - 记录调试台控制能力与鉴权约束。

## 测试与验收

### 单元测试

- 相同 seed、round、actorId 产生相同台词和投票。
- 调试台词不包含完整词对或玩家私词。
- 调试投票始终属于 `legalIds`。
- 调试模式不实例化或调用 `BasePlayerAgent`。
- 浏览器语音倍率为 `1 / 2 / 4`，普通局保持原语速。
- 经典路由不渲染调试开关、Match ID 或倍率控件。

### Workflow 测试

- 关键阶段各暂停一次。
- “继续一步”执行当前步骤并停在下一关键阶段。
- “跳过当前步骤”记录系统事件并前移。
- “连续运行”完成整局。
- 调试局不调用正式历史保存或正式 trace。
- 普通局路径、公开投影和秘密信息边界保持不变。
- `paused_debug` 仍只用于真实失败，不被正常断点占用。

### API 与权限测试

- 管理端鉴权生效。
- 普通局、错误 Match ID、非当前步骤和重复提交被拒绝。
- 控制响应使用现有统一 API 响应格式。

### 运行验收

- 在真实 WebSocket 调试局中验证 C/B 两端联动。
- C 端 V2 完成调试开局、Match ID 展示、浏览器语音、`1× / 2× / 4×` 和字幕 ACK。
- B 端完成继续、跳过和连续运行。
- 调试局从开始到终局不发起模型或云端 TTS 请求。
- 普通谁是卧底对局和经典路由完成回归。
- C/B 端控制台无错误或警告。

## 非目标

- 不为狼人杀或辩论赛增加相同调试功能。
- 不新增通用调试 DSL。
- 不允许 C 端直接调用工作流步骤控制。
- 不支持任意编辑秘密词、角色、投票结果或 workflow state。
- 不保存调试局为可回放的正式历史。
