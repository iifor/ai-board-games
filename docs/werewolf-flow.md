# 狼人杀流程编排逻辑

## 一、核心架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    createWerewolfSteps()                         │
│                     (steps.ts - 流程定义)                        │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                      tickMatch()                                 │
│               (tick.ts - 流程执行引擎)                           │
│   逐个执行 step → 调用对应 handler → 更新状态 → 下一步           │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Step Handlers                                  │
│              (handlers/ - 步骤处理器)                            │
│  actionWindowHandler / phaseHandlers / resolveHandlers           │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Events & Presentation                          │
│           (presentation.ts + messages.ts)                        │
│      生成事件 → 决定播报/静默 → 发送到客户端                      │
└─────────────────────────────────────────────────────────────────┘
```

## 二、流程步骤定义 (steps.ts)

### 整体流程

```
assign_roles → [循环: 第1天 ~ 第MAX_DAYS天] → finalize
```

### 每天的流程

```
┌─ 夜晚阶段 ─────────────────────────────────────────────────┐
│  night_start        → 天黑请闭眼                           │
│  wolf_speech        → 狼队战术部署（有序发言）              │
│  wolf_vote          → 狼人刀口投票                         │
│  seer_check         → 预言家查验（可选）                    │
│  guard_protect      → 守卫守护（可选）                      │
│  witch_save         → 女巫解药（可选）                      │
│  witch_poison       → 女巫毒药（可选）                      │
│  night_resolve      → 夜晚结算                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─ 白天阶段 ─────────────────────────────────────────────────┐
│  day_start          → 天亮了                               │
│  [首日] 警长竞选流程（见下方）                              │
│  day_speech         → 白天发言（有序发言）                  │
│  day_vote           → 白天投票                             │
│  exile_resolve      → 放逐结算                             │
│  check_win          → 胜负检查                             │
└─────────────────────────────────────────────────────────────┘
```

### 首日警长竞选流程 (仅第1天)

```
sheriff_signup       → 警长竞选报名
sheriff_speech       → 警上竞选发言（有序）
sheriff_withdraw     → 警上退水
sheriff_vote         → 警长竞选投票
sheriff_runoff_speech → 警长复投发言（可选，平票时触发）
sheriff_runoff_vote  → 警长复投投票（可选）
sheriff_resolve      → 警长竞选结算
```

## 三、步骤类型与处理器

| 步骤类型 | 处理器 | 说明 |
|---------|--------|------|
| `werewolf.assign_roles` | phaseHandlers | 分配身份牌 |
| `werewolf.night_start` | phaseHandlers | 进入夜晚，发送"天黑请闭眼" |
| `werewolf.action_window` | actionWindowHandler | 通用行动窗口（核心） |
| `werewolf.night_resolve` | resolveHandlers | 结算夜晚行动结果 |
| `werewolf.day_start` | phaseHandlers | 进入白天，发送"天亮了" |
| `werewolf.exile_resolve` | resolveHandlers | 结算放逐投票结果 |
| `werewolf.check_win` | resultHandlers | 检查胜负条件 |
| `werewolf.sheriff_resolve` | resolveHandlers | 结算警长竞选 |
| `werewolf.finalize` | resultHandlers | 游戏结束 |

## 四、行动窗口 (actionWindowHandler) - 核心

### 执行流程

```
execute()
  ├─ 检查是否已完成/有胜利者
  ├─ 检查是否有自爆（白天投票时）
  ├─ 检查是否需要跳过警长行动
  ├─ 获取 actors（有该角色的玩家）
  │   └─ actors 为空 → skipAction() → 静默跳过
  ├─ 没有打开的工作 → openActionWindow()
  │   ├─ 创建 action window
  │   ├─ 创建 blockers（AI tasks / pending actions）
  │   ├─ 发送 werewolf_action_requested 事件
  │   └─ [有阶段配置] 发送 werewolf_phase_start 事件
  ├─ 收集部分结果（有序发言时）
  ├─ 检查是否所有 actor 都完成
  │   └─ 未完成 → waitForActionWindow()
  └─ 全部完成 → 完成行动
      ├─ 应用行动结果
      ├─ 发送 werewolf_action_submitted 事件
      └─ [有阶段配置] 发送 phase_result + phase_end 事件
```

### 阶段事件（新增）

对于 `seer_check`、`guard_protect`、`witch_save`、`witch_poison`，会生成额外的阶段事件：

| 事件类型 | 触发时机 | 播报行为 |
|---------|---------|---------|
| `werewolf_phase_start` | 行动窗口打开时 | **播报**（请睁眼） |
| `werewolf_phase_action` | 玩家行动中 | 静默（C端展示图标） |
| `werewolf_phase_result` | 行动完成时 | **播报**（结果） |
| `werewolf_phase_end` | 行动结束时 | **播报**（请闭眼） |

## 五、播报逻辑 (presentation.ts)

### 事件分类

```
SILENT_ACTIONS（始终静默）:
  - wolf_vote

PHASE_ACTION_TYPES（按阶段播报）:
  - seer_check
  - guard_protect
  - witch_save
  - witch_poison

SPEAK_ALWAYS（始终播报）:
  - wolf_speech（有发言内容时）
  - day_speech
  - day_vote
```

### 播报流程图

```
事件到达
  │
  ├─ eventType === 'speech' / 'wolf-speech' / 'self-destruct'
  │   └─ 播报发言内容
  │
  ├─ workflowEvent === 'werewolf_phase_start'
  │   └─ 播报：请睁眼 + 引导语
  │
  ├─ workflowEvent === 'werewolf_phase_result'
  │   └─ 播报：行动结果
  │
  ├─ workflowEvent === 'werewolf_phase_end'
  │   └─ 播报：请闭眼
  │
  ├─ workflowEvent === 'werewolf_action_requested'
  │   ├─ wolf_vote → 静默
  │   ├─ PHASE_ACTION_TYPES → 静默
  │   └─ 其他 → 播报消息
  │
  ├─ workflowEvent === 'werewolf_action_submitted'
  │   ├─ wolf_vote → 播报"狼人请闭眼"
  │   ├─ wolf_speech → 静默
  │   ├─ PHASE_ACTION_TYPES → 静默
  │   └─ 其他 → 播报消息
  │
  ├─ workflowEvent === 'werewolf_action_skipped'
  │   └─ 全部静默
  │
  └─ workflowEvent === 'werewolf_effect_resolved'
      └─ 静默
```

## 六、观众看到的完整流程

### 标准配置（预言家+女巫+守卫+猎人）

```
═══════════════════════════════════════════
  游戏开始
═══════════════════════════════════════════
  分配身份（静默）

═══════════════════════════════════════════
  第1夜
═══════════════════════════════════════════
  🌙 天黑请闭眼

  🐺 狼人请睁眼，确认同伴并讨论战术
     (狼人发言 - 逐个播报)
     狼人讨论完毕
  🐺 狼人请闭眼

  🔮 预言家请睁眼，请选择查验的目标
     (查验结果 - C端展示)
     它的身份是好人/狼人
  🔮 预言家请闭眼

  🛡️ 守卫请睁眼，请选择今晚守护的目标
     (守护结果 - C端展示)
     守卫守护了X号 / 守卫选择空守
  🛡️ 守卫请闭眼

  🧪 女巫请睁眼
     今晚X号倒了，你有一瓶解药，你要用吗？
     (解药选择 - C端展示)
     你有一瓶毒药，你要用吗？
     (毒药选择 - C端展示)
  🧪 女巫请闭眼

  夜晚结算（静默）

═══════════════════════════════════════════
  第1天
═══════════════════════════════════════════
  ☀️ 天亮了

  [首日] 警长竞选流程
     警长竞选报名
     警上竞选发言
     警上退水
     警长竞选投票
     警长竞选结算

  💬 白天发言（逐个播报）
  🗳️ 白天投票
  ⚰️ 放逐结算
  胜负检查

═══════════════════════════════════════════
  第2夜 / 第2天 / ...
═══════════════════════════════════════════
  (重复夜晚→白天流程)

═══════════════════════════════════════════
  游戏结束
═══════════════════════════════════════════
```

### 无守卫配置

```
  🐺 狼人请睁眼 → 狼人发言 → 狼人请闭眼
  🔮 预言家请睁眼 → 查验 → 预言家请闭眼
  (守卫流程完全静默跳过)
  🧪 女巫请睁眼 → 用药 → 女巫请闭眼
```

## 七、关键配置

### 步骤配置 (StepConfig)

```ts
interface StepConfig {
  day?: number;        // 第几天
  phase?: string;      // 'night' | 'day'
  actionType?: string; // 行动类型
  optional?: boolean;  // 是否可选（无角色时跳过）
  ordered?: boolean;   // 是否有序（逐个发言）
}
```

### 阶段配置 (actionPhases.ts)

```ts
interface NightActionPhaseConfig {
  actionType: string;
  roleName: string;
  buildMessages: (day: number, context?: PhaseContext) => PhaseMessages;
}
```

## 八、扩展新角色

1. 在 `steps.ts` 添加步骤（设置 `optional: true`）
2. 在 `actionPhases.ts` 添加阶段配置
3. 在 `messages.ts` 添加消息模板
4. 在 `presentation.ts` 的 `PHASE_ACTION_TYPES` 添加 actionType
5. 在 `reducers.ts` 添加 actor 选择逻辑
6. 在 `aiActions.ts` 添加 AI 行动逻辑
