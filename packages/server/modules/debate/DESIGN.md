# 辩论赛 Agent + Skill 目标架构设计稿

> 设计文档，非实现代码。基于当前 `aiDebateRunner.js`(735行) 的重构目标架构。

---

## 1. 模块结构

```
server/modules/debate/
  index.js              # 公共导出
  service.js            # DebateGameAgent 类 + runDebateGame 入口
  constants.js          # PHASES、TOPICS、限制常量
  playerAgent.js        # DebateAgent 类（辩手 AI 包装器）
  skillRegistry.js      # DebateSkillRegistry（技能注册表）
  prompts.js            # buildSystemPrompt、buildDebateRoleName
  speech.js             # collectSpeech、emitSpeech、pushSpeech
  phases.js             # 各阶段执行函数（runStrategyPhase、runOpeningPhase 等）
  utils.js              # shuffle、choose、normalizeTopic、serializeGame、buildShareReport
  validator.js          # 辩论赛参数校验（Zod schema）
```

文件行数目标：每个 ≤ 250 行。

---

## 2. DebateAgent 类设计（playerAgent.js）

参考 `PlayerAgent` 模式，专为辩论赛场景设计。

```
class DebateAgent {
  // 属性
  player: PlayerConfig            // 玩家配置（id, nickname, apiKey, provider, model 等）
  side: 'pro' | 'con' | 'judge'  // 阵营
  debateRole: 'captain' | 'debater' | 'judge'
  sideIndex: number | null        // 同阵营序号 0-3，judge 为 null
  sideLabel: string               // '正方' | '反方' | '评委席'
  debateRoleLabel: string         // '队长' | '选手' | '评委'
  messages: Message[]             // LLM 对话历史
  speeches: Speech[]              // 发言记录

  // 方法（与 PlayerAgent 对齐）
  askText(prompt: string, options?: { maxTokens, limit, fallback }): Promise<string>
  askJson(prompt: string, options?: { maxTokens, fallback }): Promise<object>
  call(prompt: string, maxTokens?: number): Promise<string>
  recordFallback(skillId: string, reason: string, fallbackValue: any): void
}
```

关键差异 vs PlayerAgent：
- 不需要 `askVoteTarget`（辩论赛不投票选目标）
- 新增 `debateRole`/`sideIndex` 用于生成场上称谓
- `askText` 的 fallback 按阵营和角色生成兜底发言

---

## 3. DebateSkillRegistry 设计（skillRegistry.js）

继承 `shared/schemas/skillRegistry.js` 的 `SkillRegistry`，注册辩论专用技能：

| 动作 | 适用角色 | 提示词 | 执行行为 |
|------|---------|--------|----------|
| `strategize` | captain | 制定本队战术部署 | agent.askText()，产出战术文本 |
| `opening_argue` | debater(0) | 立论陈词 | agent.askText()，字数 = 350 |
| `crossfire_question` | debater(1,2) | 向对方提出质问 | agent.askText()，字数 = 60 |
| `crossfire_answer` | debater(1,2) | 回答对方质问并反击 | agent.askText()，字数 = 200 |
| `free_speech` | debater(any) | 自由辩论发言 | agent.askText()，字数 = 150 |
| `closing_summary` | debater(3) | 总结陈词 | agent.askText()，字数 = 350 |
| `judge_review` | judge | 点评双方并投票 | agent.askJson() → {winner, text} |
| `vote_mvp` | debater(any) | 评选最佳辩手 | agent.askJson() → {target} |
| `postgame_speech` | debater(any) | 赛后发言 | agent.askText()，字数 = 180 |

每个技能封装：`{ action, prompt, execute(context) }`，context 包含 `{ agent, phase, gameState, fallback }`。

---

## 4. 阶段执行函数设计（phases.js）

每个阶段独立为一个函数，接收 ctx 对象，遵循统一签名：

```
async function runXxxPhase(ctx) {
  // 1. 创建 phase 对象
  // 2. 主持人播报 → emit('phase-start')
  // 3. 执行阶段逻辑（发言收集）
  // 4. 阶段摘要 → emit('phase-end')
}
```

八个阶段函数：

| 函数 | 对应阶段 | 核心逻辑 |
|------|---------|---------|
| `runStrategyPhase(ctx)` | strategy | 双方队长战术部署 |
| `runOpeningPhase(ctx)` | opening | pro[0] → con[0] 立论 |
| `runCrossfirePhase(ctx)` | crossfire | 4 轮攻辩：pro[1]→con[1], con[1]→pro[2], pro[2]→con[2], con[2]→pro[1] |
| `runFreePhase(ctx)` | free | 交替自由辩论 8 轮，不允许连续同一人 |
| `runClosingPhase(ctx)` | closing | con[3] → pro[3] 总结 |
| `runJudgesPhase(ctx)` | judges | 评委点评 + 胜负投票 |
| `runMvpPhase(ctx)` | mvp | 正反方 8 人互投 MVP |
| `runPostgamePhase(ctx)` | postgame | 赛后发言（MVP 后置位开始） |

ctx 对象结构：
```
{
  config,          // 全局配置
  state: {         // 游戏状态
    gameId, mode, topic, agents, phases, host,
    winner, mvp, winReason
  },
  emit,            // 事件发射函数
  serialize        // 序列化函数
}
```

---

## 5. 事件契约

### 5.1 阶段事件

```
// 阶段开始
{ type: 'phase-start', phase: { id, name, limit, speeches, summary },
  message: string, game: GameSnapshot }

// 辩手发言
{ type: 'speech', phase: { id, name },
  speech: { phaseId, kind, playerId, side, debateRole, speakerLabel, text, targetId },
  game: GameSnapshot }

// 阶段结束
{ type: 'phase-end', phase: { id, name, stageSummary },
  message: string, game: GameSnapshot }
```

### 5.2 全局事件

```
// 玩家列表
{ type: 'players', players: PlayerInfo[], game: GameSnapshot }

// 游戏结束
{ type: 'game', game: GameSnapshot }
// game 包含: winner ('pro'|'con'|'draw'), mvp, winReason, shareReport

// 错误
{ type: 'error', message: string }
```

### 5.3 WebSocket 消息（客户端 → 服务端）

```
{ type: 'start', gameType: 'debate', topic?: Topic, debateTeams?: DebateTeams, hostId?: number }
{ type: 'ack', ackId: number }
{ type: 'control', action: 'pause' | 'resume' | 'skip-phase' }
```

---

## 6. service.js — DebateGameAgent 类

```
class DebateGameAgent {
  constructor(config, options = {})
    // 初始化：校验 mode、topic、agents、skillRegistry
    // 与 WerewolfGameAgent 模式对齐

  async run()
    // 顺序执行 8 个阶段
    // 每阶段：buildCtx() → runXxxPhase(ctx)
    // 赛后：emit('game') → 返回序列化结果

  async emit(event)
    // 当前直接透传，未来可加 viewPolicy 投影

  serialize(patch = {})
    // 返回完整 GameSnapshot

  buildCtx()
    // 返回 { config, state, emit, serialize }
}

async function runDebateGame(config, options = {})
  // const agent = new DebateGameAgent(config, options)
  // return agent.run()
```

---

## 7. 与当前 aiDebateRunner.js 的映射

| 当前函数（aiDebateRunner.js） | 目标文件 | 行数 |
|------|------|------|
| `createDebateAgents` + `buildSystemPrompt` | `prompts.js` | ~120 |
| `getConfiguredDebateSetup` + `normalizeDebateTeams` | `utils.js` | ~80 |
| `getDebateRoleName` | `prompts.js` | ~20 |
| `collectSpeech` + `askAgent` | `speech.js` | ~60 |
| `pushSpeech` + `emitSpeech` | `speech.js` | ~30 |
| 流程化主持播报模板 | `workflow.ts` / `phases.ts` | ~20 |
| `createPhase` | `phases.js` | ~15 |
| `runPhase` | `phases.js` | ~25 |
| 各阶段具体逻辑（strategy/opening/crossfire/free/closing） | `phases.js` | ~200 |
| `runAwardPhases`（judges + mvp） | `phases.js` | ~120 |
| `runPostgamePhase` | `phases.js` | ~40 |
| `runAiDebate`（主入口） | `service.js` | ~100 |
| `serializeGame` + `buildShareReport` | `utils.js` | ~120 |
| `shuffle`/`choose`/`normalizeTopic`/`normalizeText` | `utils.js` | ~40 |
| `topWinner`/`topVotedId` | `utils.js` | ~20 |
| `extractHighlights`/`extractJudgeComments` | `utils.js` | ~60 |
| `publicDebateLog`/`summarizeDebatePhase` | `utils.js` | ~25 |

---

## 8. 迁移路径

### Phase A — 模块骨架（不改行为）
1. 将 `aiDebateRunner.js` 中的函数按上述映射拆分到各子文件
2. `service.js` 的 `runDebateGame()` 改为从子模块组装调用
3. 删除 `aiDebateRunner.js`
4. 验证服务正常启动、辩论赛可运行

### Phase B — 引入 DebateAgent 和 Skill 系统
1. 创建 `playerAgent.js`：DebateAgent 类（参考 PlayerAgent）
2. 创建 `skillRegistry.js`：DebateSkillRegistry
3. 重构 `phases.js` 中各阶段的 `collectSpeech` 调用改为 `skillRegistry.execute(action, context)`
4. 添加 FallbackAudit 机制

### Phase C — 引入 viewPolicy（可选）
1. 创建 `views/viewPolicy.js`：debate 事件的可见性控制
2. 在 `DebateGameAgent.emit()` 中集成投影逻辑

---

## 9. 与 Werewolf 模块的对比

| 维度 | Werewolf | Debate |
|------|----------|--------|
| Agent 类 | `PlayerAgent`（askText/askJson/askVoteTarget） | `DebateAgent`（askText/askJson，无投票目标） |
| 技能注册表 | 10 个角色技能（kill/inspect/guard...） | 9 个阶段技能（strategize/argue/judge...） |
| 游戏循环 | 多天循环（night→day→vote） | 单次线性 8 阶段 |
| ctx 模式 | `{ agents, rounds, modeConfig, skillRegistry, emit, serialize }` | `{ config, state, emit, serialize }` |
| 事件投影 | `viewPolicy.js`（god/player 双模式） | 暂无（直接透传） |
| FallbackAudit | 已集成 | 待引入 |
