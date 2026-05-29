/**
 * 夜间行动阶段配置
 * 定义每个角色的播报流程：请睁眼 → 行动引导 → 结果播报 → 请闭眼
 */

interface PhaseMessages {
  start: string;
  result: string;
  end: string;
}

interface NightActionPhaseConfig {
  actionType: string;
  roleName: string;
  buildMessages: (day: number, context?: PhaseContext) => PhaseMessages;
}

interface PhaseContext {
  wolfTarget?: number | string | null;
  seerResult?: string | null;
  witchSaveUsed?: boolean;
  witchPoisonUsed?: boolean;
  guardTarget?: number | string | null;
}

const NIGHT_ACTION_PHASES: Record<string, NightActionPhaseConfig> = {
  wolf_speech: {
    actionType: 'wolf_speech',
    roleName: '狼人',
    buildMessages: () => ({
      start: ``,
      result: '',
      end: ``,
    }),
  },
  wolf_vote: {
    actionType: 'wolf_vote',
    roleName: '狼人',
    buildMessages: () => ({
      start: `请选择今晚目标`,
      result: '',
      end: `狼人请闭眼`,
    }),
  },
  seer_check: {
    actionType: 'seer_check',
    roleName: '预言家',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `预言家请睁眼，请选择查验的目标`,
      result: context?.seerResult
        ? `它的身份是${context.seerResult}`
        : '',
      end: `预言家请闭眼`,
    }),
  },
  witch_save: {
    actionType: 'witch_save',
    roleName: '女巫',
    buildMessages: () => ({
      start: `女巫请睁眼。`,
      result: `今晚它倒下了，你要救吗？`,
      end: '',
    }),
  },
  witch_poison: {
    actionType: 'witch_poison',
    roleName: '女巫',
    buildMessages: () => ({
      start: `你有一瓶毒药，你要用吗？`,
      result: '',
      end: `女巫请闭眼。`,
    }),
  },
  guard_protect: {
    actionType: 'guard_protect',
    roleName: '守卫',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `守卫请睁眼，请选择今晚守护的目标。`,
      result: context?.guardTarget
        ? `守卫守护了${context.guardTarget}号。`
        : `守卫选择空守。`,
      end: `守卫请闭眼。`,
    }),
  },
};

/**
 * 获取行动阶段配置
 */
function getActionPhaseConfig(actionType: string): NightActionPhaseConfig | null {
  return NIGHT_ACTION_PHASES[actionType] || null;
}

/**
 * 检查是否有阶段配置
 */
function hasActionPhase(actionType: string): boolean {
  return actionType in NIGHT_ACTION_PHASES;
}

export {
  NIGHT_ACTION_PHASES,
  getActionPhaseConfig,
  hasActionPhase,
};

export type {
  NightActionPhaseConfig,
  PhaseMessages,
  PhaseContext,
};
