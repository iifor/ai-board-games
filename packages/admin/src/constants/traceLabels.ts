/**
 * Trace 详情页统一翻译字典
 * 所有事件类型、Span 类型、决策类型、模型名称的中文映射集中维护
 */

// ─── 工作流事件类型 ───
const WORKFLOW_EVENT_LABELS: Record<string, string> = {
  'match_created': '游戏开始',
  'werewolf_action_submitted': '行动完成',
  'werewolf_action_requested': '行动窗口开启',
  'werewolf_action_skipped': '行动跳过',
  'werewolf_interaction_feedback': '角色交互反馈',
  'werewolf_effect_resolved': '效果结算',
  'werewolf_game_completed': '对局结束',
  'werewolf_phase_changed': '阶段切换',
  'match_completed': '对局结束',
  'match_failed': '对局失败',
  'step_skipped': '步骤跳过',
  'phase_started': '阶段开始',
};

// ─── 游戏事件类型（gameTypes.ts WEREWOLF_EVENTS + GAME_EVENTS）───
const GAME_EVENT_LABELS: Record<string, string> = {
  // 狼人夜晚
  'wolf-wake': '狼人睁眼',
  'wolf-leader': '狼队队长',
  'wolf-speech': '狼队战术讨论',
  'wolf-vote': '狼人投票',
  // 预言家
  'seer-wake': '预言家睁眼',
  'seer-check': '预言家查验',
  // 守卫
  'guard-wake': '守卫睁眼',
  'guard-action': '守卫守护',
  // 女巫
  'witch-antidote': '女巫解药',
  'witch-poison': '女巫毒药',
  'witch-action': '女巫行动',
  // 白天
  'night-result': '夜晚结果',
  'day-start': '天亮',
  'speech-order': '发言顺序',
  'vote-result': '投票结果',
  'last-words': '遗言',
  'exile-words': '放逐发言',
  'hunter-shot': '猎人开枪',
  // 警长
  'sheriff-start': '警长竞选开始',
  'sheriff-speech': '警上发言',
  'sheriff-candidates': '警长候选人',
  'sheriff-vote': '警长投票',
  'sheriff-runoff-speech': '警长复投发言',
  'sheriff-runoff-vote': '警长复投投票',
  'sheriff-result': '警长结果',
  'sheriff-badge-transfer': '警徽移交',
  'sheriff-badge-tear': '警徽撕毁',
  // 通用游戏事件
  'players': '玩家列表',
  'phase-start': '阶段开始',
  'phase-end': '阶段结束',
  'speech': '发言',
  'game': '游戏状态',
  'done': '对局完成',
  'error': '错误',
  'host': '主持人',
  'ack': '确认',
  'control': '控制',
  'start': '开始',
};

// ─── Span 类型 ───
const SPAN_TYPE_LABELS: Record<string, string> = {
  'game-root': '游戏根',
  'llm-call': 'LLM 调用',
  'agent-decision': 'Agent 决策',
  'phase': '阶段',
  'skill-execution': '技能释放',
  'workflow-tick': '工作流推进',
  'action-window': '行动窗口',
};

// ─── Span 名称 ───
const SPAN_NAME_LABELS: Record<string, string> = {
  'chat': 'LLM 对话',
  'game-root': '游戏主流程',
};

// ─── Span 名称前缀翻译（skill:kill → 技能：狼人袭击）───
const SPAN_NAME_PREFIX_LABELS: Record<string, Record<string, string>> = {
  'skill': {
    'kill': '狼人袭击',
    'inspectFaction': '查验阵营',
    'inspectRole': '查验角色',
    'guard': '守卫守护',
    'save': '女巫救人',
    'poison': '女巫毒人',
    'shootOnDeath': '猎人开枪',
    'speech': '发言',
    'vote': '投票',
    'sheriffSignup': '竞选报名',
    'sheriffWithdraw': '退水',
    'sheriffSpeech': '竞选发言',
    'sheriffVote': '竞选投票',
    'selfDestruct': '狼人自爆',
  },
  'phase': {
    'night': '夜晚',
    'day': '白天',
    'vote': '投票',
    'resolve': '结算',
    'sheriff': '警长竞选',
    'assign_roles': '分配角色',
    'night_start': '入夜',
    'day_start': '天亮',
    'day_speech': '白天发言',
    'day_vote': '白天投票',
    'night_resolve': '夜晚结算',
    'exile_resolve': '放逐结算',
    'sheriff_start': '警长竞选开始',
    'sheriff_speech': '警上发言',
    'sheriff_vote': '警长投票',
    'sheriff_resolve': '警长结算',
  },
};

// ─── Agent 决策类型 ───
const DECISION_TYPE_LABELS: Record<string, string> = {
  'wolf_kill': '狼人刀口',
  'wolf_speech': '狼人发言',
  'wolf_vote': '狼人投票',
  'seer_check': '预言家查验',
  'guard_protect': '守卫守护',
  'witch_save': '女巫救人',
  'witch_poison': '女巫毒人',
  'day_speech': '白天发言',
  'day_vote': '白天投票',
  'hunter_shot': '猎人开枪',
  'sheriff_speech': '警上发言',
  'sheriff_vote': '警长投票',
  'sheriff_signup': '竞选报名',
  'sheriff_withdraw': '退水',
  'fallback': '回退决策',
};

// ─── 行动类型（ACTION_LABELS 的镜像，供 trace 页面使用）───
const ACTION_TYPE_LABELS: Record<string, string> = {
  'wolf_kill': '狼人袭击',
  'wolf_speech': '狼队战术部署',
  'wolf_vote': '狼人投票',
  'seer_check': '预言家查验',
  'guard_protect': '守卫守护',
  'witch_save': '女巫解药',
  'witch_poison': '女巫毒药',
  'day_speech': '白天发言',
  'day_vote': '白天投票',
  'hunter_shot': '猎人开枪',
  'sheriff_signup': '警长竞选报名',
  'sheriff_speech': '警上竞选发言',
  'sheriff_withdraw': '警上退水',
  'sheriff_vote': '警长竞选投票',
  'sheriff_runoff_speech': '警长复投发言',
  'sheriff_runoff_vote': '警长复投投票',
  'sheriff_resolve': '警长竞选结算',
  'self_destruct': '狼人自爆',
};

// ─── 行动类别标签（用于更细致的事件标题）───
const ACTION_CATEGORY_LABELS: Record<string, string> = {
  'wolf_kill': '狼人行动',
  'wolf_speech': '狼人行动',
  'wolf_vote': '狼人行动',
  'seer_check': '预言家行动',
  'guard_protect': '守卫行动',
  'witch_save': '女巫行动',
  'witch_poison': '女巫行动',
  'hunter_shot': '猎人行动',
  'day_speech': '发言',
  'day_vote': '投票',
  'sheriff_signup': '警长竞选',
  'sheriff_speech': '警长竞选',
  'sheriff_withdraw': '警长竞选',
  'sheriff_vote': '警长竞选',
  'sheriff_runoff_speech': '警长竞选',
  'sheriff_runoff_vote': '警长竞选',
  'sheriff_resolve': '警长竞选',
  'self_destruct': '狼人自爆',
};

const INTERACTION_FEEDBACK_LABELS: Record<string, string> = {
  'seer_check_result': '预言家查验',
  'guard_protect_result': '守卫守护',
  'witch_save_result': '女巫解药',
  'witch_poison_result': '女巫毒药',
  'hunter_shot_result': '猎人开枪',
};

// ─── 阶段/流程标签 ───
const PHASE_LABELS: Record<string, string> = {
  'night': '夜晚',
  'day': '白天',
  'vote': '投票',
  'resolve': '结算',
  'sheriff': '警长竞选',
  'night_start': '入夜',
  'day_start': '天亮',
  'day_speech': '白天发言',
  'day_vote': '白天投票',
  'night_resolve': '夜晚结算',
  'exile_resolve': '放逐结算',
  'sheriff_start': '警长竞选开始',
  'sheriff_speech': '警上发言',
  'sheriff_vote': '警长投票',
  'sheriff_resolve': '警长结算',
  'assign_roles': '分配角色',
};

// ─── 状态标签 ───
const STATUS_LABELS: Record<string, string> = {
  'ok': '正常',
  'error': '错误',
  'fallback': '回退',
  'recording': '进行中',
  'completed': '已完成',
  'running': '运行中',
  'succeeded': '成功',
  'failed': '失败',
  'cancelled': '已取消',
  'retrying': '重试中',
  'queued': '排队中',
};

// ─── 辅助函数 ───

/** 翻译事件类型（支持 workflow 事件和 game 事件） */
function translateEventType(type: string): string {
  return WORKFLOW_EVENT_LABELS[type] || GAME_EVENT_LABELS[type] || type;
}

/** 翻译事件标题，支持从 payload 中提取主语（如哪个行动完成） */
function translateEventTitle(type: string, payload?: Record<string, unknown> | null): string {
  const base = WORKFLOW_EVENT_LABELS[type] || GAME_EVENT_LABELS[type] || type;
  if (!payload) return base;
  const actionType = (payload.action_type || payload.actionType) as string | undefined;
  if (!actionType) return base;
  const actionLabel = ACTION_TYPE_LABELS[actionType] || actionType;
  const category = ACTION_CATEGORY_LABELS[actionType];
  if (type === 'werewolf_interaction_feedback') {
    const feedbackKind = payload.feedbackKind as string | undefined;
    const feedbackLabel = INTERACTION_FEEDBACK_LABELS[feedbackKind || ''] || actionLabel;
    return `交互反馈：${feedbackLabel}`;
  }
  // 为 workflow 事件添加行动主语，使用类别+具体行动的格式
  if (type === 'werewolf_action_submitted') return category ? `${category}：${actionLabel} — 完成` : `${actionLabel} — 完成`;
  if (type === 'werewolf_action_requested') return category ? `${category}：${actionLabel} — 等待行动` : `${actionLabel} — 等待行动`;
  if (type === 'werewolf_action_skipped') return category ? `${category}：${actionLabel} — 跳过` : `${actionLabel} — 跳过`;
  if (type === 'werewolf_effect_resolved') return category ? `${category}：${actionLabel} — 效果结算` : `${actionLabel} — 效果结算`;
  return base;
}

/** 翻译 Span 类型 */
function translateSpanType(type: string): string {
  return SPAN_TYPE_LABELS[type] || type;
}

/** 翻译 Span 名称（如 chat → LLM 对话, skill:kill → 技能：狼人袭击） */
function translateSpanName(name: string): string {
  const exact = SPAN_NAME_LABELS[name];
  if (exact) return exact;
  // 处理 prefix:suffix 模式
  const colonIdx = name.indexOf(':');
  if (colonIdx > 0) {
    const prefix = name.slice(0, colonIdx);
    const suffix = name.slice(colonIdx + 1);
    const prefixMap = SPAN_NAME_PREFIX_LABELS[prefix];
    if (prefixMap?.[suffix]) return `${prefixMap[suffix]}`;
  }
  return name;
}

/** 翻译决策类型 */
function translateDecisionType(type: string): string {
  return DECISION_TYPE_LABELS[type] || ACTION_TYPE_LABELS[type] || type;
}

/** 翻译行动类型 */
function translateActionType(type: string): string {
  return ACTION_TYPE_LABELS[type] || type;
}

/** 翻译模型名称，格式：显示名（raw_id）*/
function translateModelName(model: string): string {
  return model;
}

/** 翻译供应商名称 */
function translateProvider(provider: string): string {
  return provider;
}

/** 翻译状态 */
function translateStatus(status: string): string {
  return STATUS_LABELS[status] || status;
}

/** 翻译阶段/流程名称 */
function translatePhase(phase: string): string {
  return PHASE_LABELS[phase] || phase;
}

export {
  WORKFLOW_EVENT_LABELS,
  GAME_EVENT_LABELS,
  SPAN_TYPE_LABELS,
  SPAN_NAME_LABELS,
  PHASE_LABELS,
  DECISION_TYPE_LABELS,
  ACTION_TYPE_LABELS,
  ACTION_CATEGORY_LABELS,
  STATUS_LABELS,
  translateEventType,
  translateEventTitle,
  translateSpanType,
  translateSpanName,
  translatePhase,
  translateDecisionType,
  translateActionType,
  translateModelName,
  translateProvider,
  translateStatus,
};
