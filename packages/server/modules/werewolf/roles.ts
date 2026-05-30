import { AgentSkillRegistry } from '../agent-core';
import {
  SKILL_DESCRIPTIONS,
  buildKillActionPrompt,
  buildInspectFactionActionPrompt,
  buildGuardActionPrompt,
  buildSaveActionPrompt,
  buildPoisonActionPrompt,
  buildHunterShootActionPrompt,
  buildSelfDestructActionPrompt,
} from './prompts/actions';

interface SkillAgent {
  id: number;
  faction?: string;
  usedAntidote?: boolean;
  usedPoison?: boolean;
  lastGuardTarget?: number | null;
  revealedIdiot?: boolean;
  canVote?: boolean;
  playerAgent: {
    askVoteTarget: (prompt: string, validIds: number[], options?: Record<string, unknown>) => Promise<number | null>;
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
  topTarget?: number | null;
  victim?: SkillAliveAgent | null;
  round?: SkillRound;
  modeConfig?: SkillModeConfig;
  speechText?: string;
  publicContext?: string;
  phase?: string;
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
      prompt: SKILL_DESCRIPTIONS.kill,
      async execute({ actor, alive, topTarget }: SkillContext): Promise<SkillResult> {
        const valid = alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id);
        const target = await actor.playerAgent.askVoteTarget(buildKillActionPrompt(), valid);
        return { actorId: actor.id, target, topTarget };
      }
    },
    {
      action: 'inspectFaction',
      prompt: SKILL_DESCRIPTIONS.inspectFaction,
      async execute({ actor, alive, agents }: SkillContext): Promise<SkillResult> {
        const valid = alive.filter((agent) => agent.id !== actor.id).map((agent) => agent.id);
        const target = await actor.playerAgent.askVoteTarget(buildInspectFactionActionPrompt(), valid);
        const targetAgent = agents?.find((agent) => agent.id === target);
        return { target, result: targetAgent?.faction === 'wolves' ? '狼人' : '好人' };
      }
    },
    {
      action: 'guard',
      prompt: SKILL_DESCRIPTIONS.guard,
      async execute({ actor, alive }: SkillContext): Promise<SkillResult> {
        const valid = alive.map((agent) => agent.id).filter((id) => id !== actor.lastGuardTarget);
        const target = await actor.playerAgent.askVoteTarget(buildGuardActionPrompt(), valid);
        return { target };
      }
    },
    {
      action: 'save',
      prompt: SKILL_DESCRIPTIONS.save,
      async execute({ actor, victim, round, modeConfig }: SkillContext): Promise<SkillResult> {
        const canSelfSave = round?.day === 1 && modeConfig?.witch?.canSelfSaveNightOne !== false;
        const canSaveVictim = victim && !actor.usedAntidote && (victim.id !== actor.id || canSelfSave);
        if (!canSaveVictim) return { use: false };
        const parsed = await actor.playerAgent.askJson(
          buildSaveActionPrompt(victim!.id, victim!.id === actor.id, canSelfSave),
          { maxTokens: 40 }
        );
        // AI 失败 → 不使用解药（保守）
        return { use: parsed?.use === true };
      }
    },
    {
      action: 'poison',
      prompt: SKILL_DESCRIPTIONS.poison,
      async execute({ actor, alive }: SkillContext): Promise<SkillResult> {
        if (actor.usedPoison) return { use: false, target: null };
        const valid = alive.filter((agent) => agent.id !== actor.id).map((agent) => agent.id);
        const parsed = await actor.playerAgent.askJson(
          buildPoisonActionPrompt(valid),
          { maxTokens: 60 }
        );
        // AI 失败 → 不使用毒药（保守）
        if (!parsed) return { use: false, target: null };
        const target = Number(parsed.target);
        return parsed.use && valid.includes(target) ? { use: true, target } : { use: false, target: null };
      }
    },
    {
      action: 'shootOnDeath',
      prompt: SKILL_DESCRIPTIONS.shootOnDeath,
      async execute({ actor, agents }: SkillContext): Promise<SkillResult> {
        const valid = (agents || []).filter((agent) => agent.alive).map((agent) => agent.id);
        if (!valid.length) return { target: null };
        const target = await actor.playerAgent.askVoteTarget(buildHunterShootActionPrompt(), valid);
        return { target }; // null = 不开枪
      }
    },
    {
      action: 'selfDestruct',
      prompt: SKILL_DESCRIPTIONS.selfDestruct,
      async execute({ actor, phase, publicContext, speechText }: SkillContext): Promise<SkillResult> {
        if (actor.faction !== 'wolves' || actor.alive === false || phase !== 'day') return { use: false };
        const parsed = await actor.playerAgent.askJson(
          buildSelfDestructActionPrompt(publicContext || '', speechText || ''),
          {
            maxTokens: 140,
            skillId: 'selfDestruct',
            phase: 'day'
          }
        );
        // AI 失败 → 不自爆（保守）
        if (!parsed) return { use: false, text: '' };
        const text = String(parsed.text || '').trim();
        return { use: Boolean(parsed.use), text };
      }
    },
    {
      action: 'surviveExileOnce',
      prompt: SKILL_DESCRIPTIONS.surviveExileOnce,
      async execute({ actor, modeConfig }: SkillContext): Promise<SkillResult> {
        if (modeConfig?.idiot?.surviveExileOnce === false || actor.revealedIdiot) return { survives: false };
        actor.revealedIdiot = true;
        if (modeConfig?.idiot?.losesVoteAfterReveal !== false) actor.canVote = false;
        return { survives: true };
      }
    },
    { action: 'voteOnly', prompt: SKILL_DESCRIPTIONS.voteOnly, execute: async (): Promise<SkillResult> => ({ ok: true }) },
    { action: 'speakOnly', prompt: SKILL_DESCRIPTIONS.speakOnly, execute: async (): Promise<SkillResult> => ({ ok: true }) }
  ];
}

export { createWerewolfSkillRegistry, createWerewolfSkills };
