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
    askVoteTargetOnce?: (prompt: string, validIds: number[], options?: Record<string, unknown>) => Promise<number | null>;
    askJson: (prompt: string, options: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
    askJsonOnce?: (prompt: string, options: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
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
  promptContext?: string;
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
      async execute({ actor, alive, topTarget, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id);
        const target = await askVoteTarget(actor, withPromptContext(promptContext, buildKillActionPrompt()), valid, { skillId: 'kill', phase: 'night' });
        return { actorId: actor.id, target, topTarget };
      }
    },
    {
      action: 'inspectFaction',
      prompt: SKILL_DESCRIPTIONS.inspectFaction,
      async execute({ actor, alive, agents, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.filter((agent) => agent.id !== actor.id).map((agent) => agent.id);
        const target = await askVoteTarget(actor, withPromptContext(promptContext, buildInspectFactionActionPrompt()), valid, { skillId: 'inspectFaction', phase: 'night' });
        const targetAgent = agents?.find((agent) => agent.id === target);
        return { target, result: targetAgent?.faction === 'wolves' ? '狼人' : '好人' };
      }
    },
    {
      action: 'guard',
      prompt: SKILL_DESCRIPTIONS.guard,
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.map((agent) => agent.id).filter((id) => id !== actor.lastGuardTarget);
        const target = await askVoteTarget(actor, withPromptContext(promptContext, buildGuardActionPrompt()), valid, { skillId: 'guard', phase: 'night' });
        return { target };
      }
    },
    {
      action: 'save',
      prompt: SKILL_DESCRIPTIONS.save,
      async execute({ actor, victim, round, modeConfig, promptContext }: SkillContext): Promise<SkillResult> {
        const canSelfSave = round?.day === 1 && modeConfig?.witch?.canSelfSaveNightOne !== false;
        const canSaveVictim = victim && !actor.usedAntidote && (victim.id !== actor.id || canSelfSave);
        if (!canSaveVictim) return { use: false };
        const prompt = withPromptContext(promptContext, buildSaveActionPrompt(victim!.id, victim!.id === actor.id, canSelfSave));
        const parsed = await askJson(actor, prompt, { maxTokens: 40, skillId: 'save', phase: 'night' });
        // AI 失败 → 不使用解药（保守）
        return { use: parsed?.use === true };
      }
    },
    {
      action: 'poison',
      prompt: SKILL_DESCRIPTIONS.poison,
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        if (actor.usedPoison) return { use: false, target: null };
        const valid = alive.filter((agent) => agent.id !== actor.id).map((agent) => agent.id);
        const parsed = await askJson(actor, withPromptContext(promptContext, buildPoisonActionPrompt(valid)), { maxTokens: 60, skillId: 'poison', phase: 'night' });
        // AI 失败 → 不使用毒药（保守）
        if (!parsed) return { use: false, target: null };
        const target = Number(parsed.target);
        return parsed.use && valid.includes(target) ? { use: true, target } : { use: false, target: null };
      }
    },
    {
      action: 'shootOnDeath',
      prompt: SKILL_DESCRIPTIONS.shootOnDeath,
      async execute({ actor, agents, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = (agents || []).filter((agent) => agent.alive).map((agent) => agent.id);
        if (!valid.length) return { target: null };
        const target = await askVoteTarget(actor, withPromptContext(promptContext, buildHunterShootActionPrompt()), valid, { skillId: 'shootOnDeath', phase: 'death' });
        return { target }; // null = 不开枪
      }
    },
    {
      action: 'selfDestruct',
      prompt: SKILL_DESCRIPTIONS.selfDestruct,
      async execute({ actor, phase, publicContext, speechText, promptContext }: SkillContext): Promise<SkillResult> {
        if (actor.faction !== 'wolves' || actor.alive === false || phase !== 'day') return { use: false };
        const prompt = withPromptContext(promptContext, buildSelfDestructActionPrompt(publicContext || '', speechText || ''));
        const parsed = await askJson(actor, prompt, {
          maxTokens: 140,
          skillId: 'selfDestruct',
          phase: 'day'
        });
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

function withPromptContext(context: string | undefined, task: string): string {
  return [context, task].filter(Boolean).join('\n\n');
}

function askVoteTarget(actor: SkillAgent, prompt: string, valid: number[], options: Record<string, unknown>): Promise<number | null> {
  return actor.playerAgent.askVoteTargetOnce
    ? actor.playerAgent.askVoteTargetOnce(prompt, valid, options)
    : actor.playerAgent.askVoteTarget(prompt, valid, options);
}

function askJson(actor: SkillAgent, prompt: string, options: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  return actor.playerAgent.askJsonOnce
    ? actor.playerAgent.askJsonOnce(prompt, options)
    : actor.playerAgent.askJson(prompt, options);
}

export { createWerewolfSkillRegistry, createWerewolfSkills };
