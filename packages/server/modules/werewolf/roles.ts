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
  reason?: string | null;
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
        if (!valid.length) return { actorId: actor.id, target: null, topTarget };
        const prompt = withPromptContext(promptContext, buildKillActionPrompt(valid), 'wolf_kill');
        const target = await askVoteTarget(actor, prompt, valid, {
          skillId: 'kill',
          phase: 'night',
          allowNull: true,
          promptHasContract: hasOutputContract(prompt),
        });
        return { actorId: actor.id, target, topTarget };
      }
    },
    {
      action: 'inspectFaction',
      prompt: SKILL_DESCRIPTIONS.inspectFaction,
      async execute({ actor, alive, agents, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.filter((agent) => agent.id !== actor.id).map((agent) => agent.id);
        if (!valid.length) return { target: null, result: 'unknown', reason: null };
        const prompt = withPromptContext(promptContext, buildInspectFactionActionPrompt(valid), 'seer_check');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'inspectFaction',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        if (!target || !valid.includes(target)) return { target: null, result: 'unknown', reason: normalizeReason(parsed?.reason) };
        const targetAgent = agents?.find((agent) => agent.id === target);
        return { target, result: targetAgent?.faction === 'wolves' ? '狼人' : '好人', reason: normalizeReason(parsed?.reason) };
      }
    },
    {
      action: 'guard',
      prompt: SKILL_DESCRIPTIONS.guard,
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.map((agent) => agent.id).filter((id) => id !== actor.lastGuardTarget);
        const prompt = withPromptContext(promptContext, buildGuardActionPrompt(), 'guard_protect');
        const target = await askVoteTarget(actor, prompt, valid, {
          skillId: 'guard',
          phase: 'night',
          allowNull: true,
          promptHasContract: hasOutputContract(prompt),
        });
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
        const prompt = withPromptContext(promptContext, buildSaveActionPrompt(victim!.id, victim!.id === actor.id, canSelfSave), 'witch_save');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'save',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        // AI 失败 → 不使用解药（保守）
        const use = parsed?.use === true;
        return { use, reason: use && victim!.id !== actor.id ? normalizeReason(parsed?.reason) : null };
      }
    },
    {
      action: 'poison',
      prompt: SKILL_DESCRIPTIONS.poison,
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        if (actor.usedPoison) return { use: false, target: null };
        const valid = alive.filter((agent) => agent.id !== actor.id).map((agent) => agent.id);
        if (!valid.length) return { use: false, target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildPoisonActionPrompt(valid), 'witch_poison');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'poison',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        // AI 失败 → 不使用毒药（保守）
        if (!parsed) return { use: false, target: null };
        const target = parseTargetSeat(parsed);
        return parsed.use && target && valid.includes(target)
          ? { use: true, target, reason: normalizeReason(parsed.reason) }
          : { use: false, target: null, reason: normalizeReason(parsed.reason) };
      }
    },
    {
      action: 'shootOnDeath',
      prompt: SKILL_DESCRIPTIONS.shootOnDeath,
      async execute({ actor, agents, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = (agents || []).filter((agent) => agent.alive && Number(agent.id) !== Number(actor.id)).map((agent) => agent.id);
        if (!valid.length) return { target: null };
        const prompt = withPromptContext(promptContext, buildHunterShootActionPrompt(valid), 'hunter_shot');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'shootOnDeath',
          phase: 'death',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: null, reason: normalizeReason(parsed?.reason) }; // null = 不开枪
      }
    },
    {
      action: 'selfDestruct',
      prompt: SKILL_DESCRIPTIONS.selfDestruct,
      async execute({ actor, phase, publicContext, speechText, promptContext }: SkillContext): Promise<SkillResult> {
        if (actor.faction !== 'wolves' || actor.alive === false || phase !== 'day') return { use: false };
        const prompt = withPromptContext(
          promptContext,
          buildSelfDestructActionPrompt(promptContext ? '' : (publicContext || ''), speechText || ''),
          'self_destruct'
        );
        const parsed = await askJson(actor, prompt, {
          maxTokens: 140,
          skillId: 'selfDestruct',
          phase: 'day',
          promptHasContract: hasOutputContract(prompt),
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

function withPromptContext(context: string | undefined, task: string, expectedActionType: string): string {
  if (context?.includes(`当前行动：${expectedActionType}。`) && hasOutputContract(context)) return context;
  return [context, task].filter(Boolean).join('\n\n');
}

function hasOutputContract(prompt: string): boolean {
  return prompt.includes('【输出格式】');
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

function parseTargetSeat(parsed: Record<string, unknown> | null | undefined): number | null {
  const target = Number(parsed?.targetSeat ?? parsed?.target);
  return Number.isFinite(target) && target > 0 ? target : null;
}

function normalizeReason(value: unknown): string | null {
  const reason = String(value || '').trim();
  return reason || null;
}

export { createWerewolfSkillRegistry, createWerewolfSkills };
