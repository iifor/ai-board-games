import { AgentSkillRegistry } from '../agent-core';

interface SkillAgent {
  id: number;
  faction?: string;
  usedAntidote?: boolean;
  usedPoison?: boolean;
  lastGuardTarget?: number | null;
  revealedIdiot?: boolean;
  canVote?: boolean;
  playerAgent: {
    askVoteTarget: (prompt: string, validIds: number[], fallback: number) => Promise<number>;
    askJson: (prompt: string, options: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  };
  [key: string]: unknown;
}

interface SkillAliveAgent {
  id: number;
  faction?: string;
  alive?: boolean;
  [key: string]: unknown;
}

interface SkillRound {
  day: number;
  [key: string]: unknown;
}

interface SkillModeConfig {
  witch?: { canSelfSaveNightOne?: boolean };
  idiot?: { surviveExileOnce?: boolean; losesVoteAfterReveal?: boolean };
  [key: string]: unknown;
}

interface SkillContext {
  actor: SkillAgent;
  alive: SkillAliveAgent[];
  agents?: SkillAliveAgent[];
  fallback?: number;
  topTarget?: number | null;
  victim?: SkillAliveAgent | null;
  round?: SkillRound;
  modeConfig?: SkillModeConfig;
  [key: string]: unknown;
}

interface SkillResult {
  actorId?: number;
  target?: number | null;
  topTarget?: number | null;
  result?: string;
  use?: boolean;
  survives?: boolean;
  ok?: boolean;
  text?: string;
}

function createWerewolfSkillRegistry(): InstanceType<typeof AgentSkillRegistry> {
  return new AgentSkillRegistry(createWerewolfSkills());
}

function createWerewolfSkills() {
  return [
    {
      action: 'kill',
      prompt: '夜晚选择击杀目标。',
      async execute({ actor, alive, fallback, topTarget }: SkillContext): Promise<SkillResult> {
        const valid = alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id);
        const target = await actor.playerAgent.askVoteTarget('狼人夜晚行动：请选择今晚击杀目标。', valid, fallback!);
        return { actorId: actor.id, target, topTarget };
      }
    },
    {
      action: 'inspectFaction',
      prompt: '夜晚查验一名玩家阵营。',
      async execute({ actor, alive, agents }: SkillContext): Promise<SkillResult> {
        const valid = alive.filter((agent) => agent.id !== actor.id).map((agent) => agent.id);
        const target = await actor.playerAgent.askVoteTarget('预言家夜晚行动：请选择一名玩家查验阵营。', valid, valid[0]);
        const targetAgent = agents?.find((agent) => agent.id === target);
        return { target, result: targetAgent?.faction === 'wolves' ? '狼人' : '好人' };
      }
    },
    {
      action: 'guard',
      prompt: '夜晚守护一名玩家，不能连续两晚守护同一人。',
      async execute({ actor, alive }: SkillContext): Promise<SkillResult> {
        const valid = alive.map((agent) => agent.id).filter((id) => id !== actor.lastGuardTarget);
        const target = await actor.playerAgent.askVoteTarget('守卫夜晚行动：请选择今晚守护目标，不能连续两晚守同一人。', valid, valid[0]);
        return { target };
      }
    },
    {
      action: 'save',
      prompt: '女巫解药，可救今晚被狼人袭击的玩家。',
      async execute({ actor, victim, round, modeConfig }: SkillContext): Promise<SkillResult> {
        const canSelfSave = round?.day === 1 && modeConfig?.witch?.canSelfSaveNightOne !== false;
        const canSaveVictim = victim && !actor.usedAntidote && (victim.id !== actor.id || canSelfSave);
        if (!canSaveVictim) return { use: false };
        const parsed = await actor.playerAgent.askJson([
          `今晚狼人袭击了 ${victim!.id} 号。你还有解药。${victim!.id === actor.id ? '首夜允许自救。' : ''}`,
          '是否使用解药救人？只返回 JSON：{"use":true}，不要返回理由。'
        ].join('\n\n'), { maxTokens: 40, fallback: { use: Math.random() > 0.25 } });
        return { use: Boolean(parsed?.use) };
      }
    },
    {
      action: 'poison',
      prompt: '女巫毒药，可毒杀一名玩家。',
      async execute({ actor, alive }: SkillContext): Promise<SkillResult> {
        if (actor.usedPoison) return { use: false, target: null };
        const valid = alive.filter((agent) => agent.id !== actor.id).map((agent) => agent.id);
        const parsed = await actor.playerAgent.askJson([
          '你还有毒药。请选择是否使用毒药；不用毒药时 target 返回 null。',
          `可选目标：${valid.join('、')}`,
          '只返回 JSON：{"use":false,"target":null}，不要返回理由。'
        ].join('\n\n'), { maxTokens: 60, fallback: { use: false, target: null } });
        const target = Number(parsed?.target);
        return parsed?.use && valid.includes(target) ? { use: true, target } : { use: false, target: null };
      }
    },
    {
      action: 'shootOnDeath',
      prompt: '死亡或放逐时可以开枪带走一名玩家。',
      async execute({ actor, agents, fallback }: SkillContext): Promise<SkillResult> {
        const valid = (agents || []).filter((agent) => agent.alive).map((agent) => agent.id);
        if (!valid.length) return { target: null };
        const target = await actor.playerAgent.askVoteTarget('你是猎人，已出局。请选择是否开枪带走一名玩家。必须选择一名目标。', valid, fallback!);
        return { target };
      }
    },
    {
      action: 'selfDestruct',
      prompt: '狼人白天可以自爆，立即出局并中止当前白天流程。',
      async execute({ actor, phase, publicContext, speechText }: SkillContext): Promise<SkillResult> {
        if (actor.faction !== 'wolves' || actor.alive === false || phase !== 'day') return { use: false };
        const parsed = await actor.playerAgent.askJson([
          '你是狼人，当前处于白天公开流程。你可以选择是否发动自爆。',
          '自爆效果：你立即出局，本轮白天发言/投票中止，流程进入后续胜负检查或夜晚。',
          `当前公开信息：\n${publicContext || '暂无公开信息。'}`,
          `你刚才的公开发言：${speechText || '暂无'}`,
          '只有在继续发言会明显暴露狼队、或自爆能保护狼队/打断关键归票时才使用。',
          '只返回 JSON：{"use":false,"text":""} 或 {"use":true,"text":"自爆宣言"}。'
        ].join('\n\n'), {
          maxTokens: 140,
          fallback: { use: false, text: '' },
          skillId: 'selfDestruct',
          phase: 'day'
        });
        const text = String(parsed?.text || '').trim();
        return { use: Boolean(parsed?.use), text };
      }
    },
    {
      action: 'surviveExileOnce',
      prompt: '首次被白天放逐时翻牌免死并失去投票权。',
      async execute({ actor, modeConfig }: SkillContext): Promise<SkillResult> {
        if (modeConfig?.idiot?.surviveExileOnce === false || actor.revealedIdiot) return { survives: false };
        actor.revealedIdiot = true;
        if (modeConfig?.idiot?.losesVoteAfterReveal !== false) actor.canVote = false;
        return { survives: true };
      }
    },
    { action: 'voteOnly', prompt: '白天投票。', execute: async (): Promise<SkillResult> => ({ ok: true }) },
    { action: 'speakOnly', prompt: '白天发言。', execute: async (): Promise<SkillResult> => ({ ok: true }) }
  ];
}

export { createWerewolfSkillRegistry, createWerewolfSkills };
