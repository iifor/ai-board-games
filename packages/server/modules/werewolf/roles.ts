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
  buildHybridChooseMasterPrompt,
  buildElderSilencePrompt,
  buildKnightDuelPrompt,
  buildButterflyHugPrompt,
  buildStalkerAssassinatePrompt,
  buildWolfBeautyCharmPrompt,
  buildDemonInspectPrompt,
  buildNightmareFearPrompt,
  buildDreamerDreamPrompt,
  buildMagicianSwapPrompt,
  buildFortuneTellerMarkPrompt,
  buildBigBadWolfKillPrompt,
  buildCrowCursePrompt,
  buildTargetJsonContract,
} from './prompts/actions';

interface SkillAgent {
  id: number;
  faction?: string;
  role?: string;
  roleLabel?: string;
  roleConfig?: { id?: string; name?: string; [key: string]: unknown };
  usedAntidote?: boolean;
  usedPoison?: boolean;
  lastGuardTarget?: number | null;
  lastSilencedTarget?: number | null;
  knightDuelUsed?: boolean;
  butterflyHugUsed?: number;
  stalkerAssassinateUsed?: boolean;
  lastNightmareTarget?: number | null;
  lastPenguinTarget?: number | null;
  foxInspectLost?: boolean;
  lastDreamTarget?: number | null;
  magicianSwappedIds?: number[];
  lastCrowTarget?: number | null;
  spiritWolfLearnedRole?: string | null;
  spiritWolfAntidoteUsed?: boolean;
  lastSpiritWolfGuardTarget?: number | null;
  wolfWitchLastCurseDay?: number | null;
  lastIllusionDay?: number | null;
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
  targetIds?: number[];
  [key: string]: unknown;
}

interface SkillResult {
  actorId?: number;
  target?: number | null;
  targetSeat?: number | null;
  secondTarget?: number | null;
  witnessId?: number | null;
  roaring?: boolean;
  adjacentWolfIds?: number[];
  topTarget?: number | null;
  result?: string;
  gift?: string | null;
  roleId?: string | null;
  learnedRole?: string | null;
  offeredRoleIds?: string[];
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
        if (!target || !valid.includes(target)) return { target: null, result: 'unknown', reason: null };
        const targetAgent = agents?.find((agent) => agent.id === target);
        return { target, result: targetAgent?.faction === 'wolves' ? '狼人' : '好人', reason: normalizeReason(parsed?.reason) };
      }
    },
    {
      action: 'guard',
      prompt: SKILL_DESCRIPTIONS.guard,
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.map((agent) => agent.id).filter((id) => id !== actor.lastGuardTarget);
        const prompt = withPromptContext(promptContext, buildGuardActionPrompt(valid), 'guard_protect');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'guard',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: null, reason: null };
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
        return { use, reason: use ? normalizeReason(parsed?.reason) : null };
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
          ? { target }
          : { target: null };
      }
    },
    {
      action: 'selfDestruct',
      prompt: SKILL_DESCRIPTIONS.selfDestruct,
      async execute({ actor, alive, phase, publicContext, speechText, promptContext }: SkillContext): Promise<SkillResult> {
        if (actor.faction !== 'wolves' || actor.alive === false || phase !== 'day') return { use: false };
        const canTakeTarget = isWhiteWolfKing(actor);
        const valid = canTakeTarget
          ? alive.filter((agent) => agent.id !== actor.id).map((agent) => agent.id)
          : [];
        const prompt = withPromptContext(
          promptContext,
          buildSelfDestructActionPrompt(promptContext ? '' : (publicContext || ''), speechText || '', valid),
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
        const target = canTakeTarget ? parseTargetSeat(parsed) : null;
        return { use: Boolean(parsed.use), text, target: target && valid.includes(target) ? target : null };
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
    {
      action: 'chooseMaster',
      prompt: SKILL_DESCRIPTIONS.chooseMaster,
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.filter((agent) => Number(agent.id) !== Number(actor.id)).map((agent) => agent.id);
        if (!valid.length) return { target: null };
        const prompt = withPromptContext(promptContext, buildHybridChooseMasterPrompt(valid), 'hybrid_choose_master');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 80,
          skillId: 'chooseMaster',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target) ? { target } : { target: null };
      }
    },
    {
      action: 'silence',
      prompt: SKILL_DESCRIPTIONS.silence,
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive
          .map((agent) => agent.id)
          .filter((id) => Number(id) !== Number(actor.lastSilencedTarget));
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildElderSilencePrompt(valid), 'elder_silence');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'silence',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: null, reason: null };
      }
    },
    {
      action: 'duel',
      prompt: SKILL_DESCRIPTIONS.duel,
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        if (actor.knightDuelUsed) return { target: null, reason: null };
        const valid = alive.filter((agent) => Number(agent.id) !== Number(actor.id)).map((agent) => agent.id);
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildKnightDuelPrompt(valid), 'knight_duel');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'duel',
          phase: 'day',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: null, reason: null };
      }
    },
    {
      action: 'hug',
      prompt: SKILL_DESCRIPTIONS.hug,
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        if (Number(actor.butterflyHugUsed || 0) >= 2) return { target: null, reason: null };
        const valid = alive.filter((agent) => Number(agent.id) !== Number(actor.id)).map((agent) => agent.id);
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildButterflyHugPrompt(valid), 'butterfly_hug');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'hug',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: null, reason: null };
      }
    },
    {
      action: 'stalk',
      prompt: SKILL_DESCRIPTIONS.stalk,
      async execute({ actor, targetIds, promptContext }: SkillContext): Promise<SkillResult> {
        if (actor.stalkerAssassinateUsed || !targetIds?.length) return { target: null, reason: null };
        const targetId = targetIds[0];
        const prompt = withPromptContext(promptContext, buildStalkerAssassinatePrompt(targetId), 'stalker_assassinate');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'stalk',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        return parsed?.use === true && target === targetId
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: null, reason: null };
      }
    },
    {
      action: 'charm',
      prompt: SKILL_DESCRIPTIONS.charm,
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.filter((agent) => Number(agent.id) !== Number(actor.id)).map((agent) => agent.id);
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildWolfBeautyCharmPrompt(valid), 'wolf_beauty_charm');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'charm',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: null, reason: null };
      }
    },
    {
      action: 'inspectRoleType',
      prompt: SKILL_DESCRIPTIONS.inspectRoleType,
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id);
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildDemonInspectPrompt(valid), 'demon_inspect');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'inspectRoleType',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: null, reason: null };
      }
    },
    {
      action: 'fear',
      prompt: SKILL_DESCRIPTIONS.fear,
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(actor.lastNightmareTarget));
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildNightmareFearPrompt(valid), 'nightmare_fear');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'fear',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: null, reason: null };
      }
    },
    {
      action: 'dream',
      prompt: SKILL_DESCRIPTIONS.dream,
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(actor.id));
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildDreamerDreamPrompt(valid), 'dreamer_dream');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'dream',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: null, reason: null };
      }
    },
    {
      action: 'swap',
      prompt: SKILL_DESCRIPTIONS.swap,
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const used = new Set((actor.magicianSwappedIds || []).map((id) => Number(id)));
        const valid = alive.map((agent) => agent.id).filter((id) => !used.has(Number(id)));
        if (valid.length < 2) return { target: null, secondTarget: null, reason: null };
        const prompt = withPromptContext(promptContext, buildMagicianSwapPrompt(valid), 'magician_swap');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 120,
          skillId: 'swap',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        const first = parseTargetSeat(parsed);
        const second = Number(parsed?.secondTargetSeat ?? parsed?.secondTarget ?? parsed?.targetB);
        return first && second && first !== second && valid.includes(first) && valid.includes(second)
          ? { target: first, secondTarget: second, reason: normalizeReason(parsed?.reason) }
          : { target: null, secondTarget: null, reason: null };
      }
    },
    {
      action: 'mark',
      prompt: SKILL_DESCRIPTIONS.mark,
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(actor.id));
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildFortuneTellerMarkPrompt(valid), 'fortune_teller_mark');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'mark',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: null, reason: null };
      }
    },
    {
      action: 'soloKill',
      prompt: SKILL_DESCRIPTIONS.soloKill,
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id);
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildBigBadWolfKillPrompt(valid), 'big_bad_wolf_kill');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'soloKill',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: null, reason: null };
      }
    },
    {
      action: 'curse',
      prompt: SKILL_DESCRIPTIONS.curse,
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(actor.id) && Number(id) !== Number(actor.lastCrowTarget));
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildCrowCursePrompt(valid), 'crow_curse');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'curse',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: null, reason: null };
      }
    },
    {
      action: 'freeze',
      prompt: SKILL_DESCRIPTIONS.freeze || 'Freeze one living player at night.',
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive
          .map((agent) => agent.id)
          .filter((id) => Number(id) !== Number(actor.id) && Number(id) !== Number(actor.lastPenguinTarget));
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildTargetJsonContract(valid, { reason: 'optional', nullable: true }), 'penguin_freeze');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'freeze',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: null, reason: normalizeReason(parsed?.reason) };
      }
    },
    {
      action: 'foxInspect',
      prompt: SKILL_DESCRIPTIONS.foxInspect || 'Inspect a connected three-seat group for wolves.',
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        if (actor.foxInspectLost) return { target: null, reason: null };
        const valid = alive.map((agent) => agent.id);
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildTargetJsonContract(valid, { reason: 'optional' }), 'fox_inspect');
        const parsed = await askJson(actor, prompt, {
          maxTokens: 100,
          skillId: 'foxInspect',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: null, reason: normalizeReason(parsed?.reason) };
      }
    },
    {
      action: 'bearRoar',
      prompt: SKILL_DESCRIPTIONS.bearRoar,
      execute({ adjacentWolfIds }: SkillContext): Promise<SkillResult> {
        const ids = Array.isArray(adjacentWolfIds) ? adjacentWolfIds.map((id) => Number(id)).filter((id) => id > 0) : [];
        return Promise.resolve({ roaring: ids.length > 0, adjacentWolfIds: ids });
      }
    },
    {
      action: 'blackMerchantGift',
      prompt: SKILL_DESCRIPTIONS.blackMerchantGift || 'Gift one temporary skill to a living player.',
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(actor.id));
        if (!valid.length) return { target: null, gift: null, reason: null };
        const prompt = withPromptContext(
          promptContext,
          `${buildTargetJsonContract(valid, { reason: 'optional' })}\n可选 gift: inspectFaction, poison, shootOnDeath。`,
          'black_merchant_gift',
        );
        const parsed = await askJson(actor, prompt, {
          maxTokens: 120,
          skillId: 'blackMerchantGift',
          phase: 'night',
          promptHasContract: hasOutputContract(prompt),
        });
        const target = parseTargetSeat(parsed);
        const gift = normalizeGift(parsed?.gift ?? parsed?.skill);
        return target && valid.includes(target) && gift
          ? { target, gift, reason: normalizeReason(parsed?.reason) }
          : { target: null, gift: null, reason: normalizeReason(parsed?.reason) };
      }
    },
    {
      action: 'stealRole',
      prompt: SKILL_DESCRIPTIONS.stealRole || 'Choose one offered role.',
      async execute({ actor, modeConfig, promptContext }: SkillContext): Promise<SkillResult> {
        const offered = Array.isArray(modeConfig?.thiefOfferedRoleIds)
          ? (modeConfig.thiefOfferedRoleIds as string[]).map((item) => String(item)).filter(Boolean)
          : ['villager', 'werewolf'];
        const wolfRole = offered.find((roleId) => roleId.includes('wolf') || roleId === 'werewolf');
        if (wolfRole) return { roleId: wolfRole, offeredRoleIds: offered, reason: 'must-take-wolf' };
        const prompt = withPromptContext(promptContext, `Choose one roleId from: ${offered.join(', ')}. Return {"roleId":"${offered[0] || 'villager'}","reason":"short"}.`, 'thief_choose');
        const parsed = await askJson(actor, prompt, { maxTokens: 80, skillId: 'stealRole', phase: 'night', promptHasContract: hasOutputContract(prompt) });
        const roleId = offered.includes(String(parsed?.roleId || '')) ? String(parsed?.roleId) : offered[0] || 'villager';
        return { roleId, offeredRoleIds: offered, reason: normalizeReason(parsed?.reason) };
      }
    },
    {
      action: 'linkLovers',
      prompt: SKILL_DESCRIPTIONS.linkLovers || 'Choose two lovers.',
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.map((agent) => Number(agent.id)).filter((id) => Number(id) !== Number(actor.id));
        if (valid.length < 2) return { target: null, secondTarget: null, reason: null };
        const prompt = withPromptContext(promptContext, `${buildTargetJsonContract(valid, { reason: 'optional' })}\nAlso return secondTarget with a different id.`, 'cupid_link');
        const parsed = await askJson(actor, prompt, { maxTokens: 120, skillId: 'linkLovers', phase: 'night', promptHasContract: hasOutputContract(prompt) });
        const first = parseTargetSeat(parsed);
        const second = Number(parsed?.secondTarget ?? parsed?.targetB);
        return first && second && first !== second && valid.includes(first) && valid.includes(second)
          ? { target: first, secondTarget: second, reason: normalizeReason(parsed?.reason) }
          : { target: valid[0], secondTarget: valid[1], reason: normalizeReason(parsed?.reason) };
      }
    },
    {
      action: 'succubusLink',
      prompt: SKILL_DESCRIPTIONS.succubusLink || 'Choose one good player as lover.',
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.map((agent) => Number(agent.id)).filter((id) => Number(id) !== Number(actor.id));
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildTargetJsonContract(valid, { reason: 'optional' }), 'succubus_link');
        const parsed = await askJson(actor, prompt, { maxTokens: 100, skillId: 'succubusLink', phase: 'night', promptHasContract: hasOutputContract(prompt) });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: valid[0], reason: normalizeReason(parsed?.reason) };
      }
    },
    {
      action: 'ghostBrideLink',
      prompt: SKILL_DESCRIPTIONS.ghostBrideLink || 'Choose a groom and witness.',
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.map((agent) => Number(agent.id)).filter((id) => Number(id) !== Number(actor.id));
        if (valid.length < 2) return { target: null, secondTarget: null, reason: null };
        const prompt = withPromptContext(promptContext, `${buildTargetJsonContract(valid, { reason: 'optional' })}\nAlso return witnessId with a different id.`, 'ghost_bride_link');
        const parsed = await askJson(actor, prompt, { maxTokens: 120, skillId: 'ghostBrideLink', phase: 'night', promptHasContract: hasOutputContract(prompt) });
        const partner = parseTargetSeat(parsed);
        const witness = Number(parsed?.witnessId ?? parsed?.secondTarget);
        return partner && witness && partner !== witness && valid.includes(partner) && valid.includes(witness)
          ? { target: partner, witnessId: witness, secondTarget: witness, reason: normalizeReason(parsed?.reason) }
          : { target: valid[0], witnessId: valid[1], secondTarget: valid[1], reason: normalizeReason(parsed?.reason) };
      }
    },
    {
      action: 'ghostBrideChat',
      prompt: SKILL_DESCRIPTIONS.ghostBrideChat || 'Private night chat.',
      async execute({ actor, promptContext }: SkillContext): Promise<SkillResult> {
        const prompt = withPromptContext(promptContext, 'Return {"text":"short private night chat"}; keep it under 80 characters.', 'ghost_bride_chat');
        const parsed = await askJson(actor, prompt, { maxTokens: 100, skillId: 'ghostBrideChat', phase: 'night', promptHasContract: hasOutputContract(prompt) });
        const text = String(parsed?.text || '').trim().slice(0, 80);
        return { text: text || '今晚先隐藏第三方关系。', reason: normalizeReason(parsed?.reason) };
      }
    },
    {
      action: 'ghostBrideKill',
      prompt: SKILL_DESCRIPTIONS.ghostBrideKill || 'Kill one non-third-party player.',
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.map((agent) => Number(agent.id)).filter((id) => Number(id) !== Number(actor.id));
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildTargetJsonContract(valid, { reason: 'optional' }), 'ghost_bride_kill');
        const parsed = await askJson(actor, prompt, { maxTokens: 100, skillId: 'ghostBrideKill', phase: 'night', promptHasContract: hasOutputContract(prompt) });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: valid[0], reason: normalizeReason(parsed?.reason) };
      }
    },
    {
      action: 'demonHunterHunt',
      prompt: SKILL_DESCRIPTIONS.demonHunterHunt || 'Hunt one living player from the second night onward.',
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.map((agent) => Number(agent.id)).filter((id) => Number(id) !== Number(actor.id));
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildTargetJsonContract(valid, { reason: 'optional' }), 'demon_hunter_hunt');
        const parsed = await askJson(actor, prompt, { maxTokens: 100, skillId: 'demonHunterHunt', phase: 'night', promptHasContract: hasOutputContract(prompt) });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: valid[0], reason: normalizeReason(parsed?.reason) };
      }
    },
    {
      action: 'spiritWolfLearn',
      prompt: 'First night only: learn one living good player skill.',
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.filter((agent) => agent.faction !== 'wolves').map((agent) => Number(agent.id));
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildTargetJsonContract(valid, { reason: 'optional' }), 'spirit_wolf_learn');
        const parsed = await askJson(actor, prompt, { maxTokens: 100, skillId: 'spiritWolfLearn', phase: 'night', promptHasContract: hasOutputContract(prompt) });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: valid[0], reason: normalizeReason(parsed?.reason) };
      }
    },
    {
      action: 'spiritWolfInspect',
      prompt: 'After learning Seer, inspect one living good player as god or villager.',
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.filter((agent) => agent.faction !== 'wolves').map((agent) => Number(agent.id));
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildTargetJsonContract(valid, { reason: 'optional' }), 'spirit_wolf_inspect');
        const parsed = await askJson(actor, prompt, { maxTokens: 100, skillId: 'spiritWolfInspect', phase: 'night', promptHasContract: hasOutputContract(prompt) });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: valid[0], reason: normalizeReason(parsed?.reason) };
      }
    },
    {
      action: 'spiritWolfGuard',
      prompt: 'After learning Guard, protect one player and do not repeat last target.',
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.map((agent) => Number(agent.id)).filter((id) => Number(id) !== Number(actor.lastSpiritWolfGuardTarget));
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildTargetJsonContract(valid, { reason: 'optional' }), 'spirit_wolf_guard');
        const parsed = await askJson(actor, prompt, { maxTokens: 100, skillId: 'spiritWolfGuard', phase: 'night', promptHasContract: hasOutputContract(prompt) });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: valid[0], reason: normalizeReason(parsed?.reason) };
      }
    },
    {
      action: 'spiritWolfAntidote',
      prompt: 'After learning Witch, use one antidote to save the witch poison target.',
      async execute({ actor, round }: SkillContext): Promise<SkillResult> {
        const target = Number((round?.night as { witchPoisonTarget?: unknown } | undefined)?.witchPoisonTarget || 0);
        if (!target || target === Number(actor.id) || actor.spiritWolfAntidoteUsed) return { use: false, target: null, reason: null };
        return { use: true, target, targetSeat: target, reason: 'spirit-wolf-antidote' };
      }
    },
    {
      action: 'wolfWitchCurse',
      prompt: 'Choose one living good player to curse until the next night.',
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.filter((agent) => agent.faction === 'good').map((agent) => Number(agent.id));
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildTargetJsonContract(valid, { reason: 'optional', nullable: true }), 'wolf_witch_curse');
        const parsed = await askJson(actor, prompt, { maxTokens: 100, skillId: 'wolfWitchCurse', phase: 'night', promptHasContract: hasOutputContract(prompt) });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: null, reason: normalizeReason(parsed?.reason) };
      }
    },
    {
      action: 'illusion',
      prompt: 'Choose one living non-self player as the illusion target.',
      async execute({ actor, alive, promptContext }: SkillContext): Promise<SkillResult> {
        const valid = alive.map((agent) => Number(agent.id)).filter((id) => Number(id) !== Number(actor.id));
        if (!valid.length) return { target: null, reason: null };
        const prompt = withPromptContext(promptContext, buildTargetJsonContract(valid, { reason: 'optional', nullable: true }), 'illusionist_illusion');
        const parsed = await askJson(actor, prompt, { maxTokens: 100, skillId: 'illusion', phase: 'night', promptHasContract: hasOutputContract(prompt) });
        const target = parseTargetSeat(parsed);
        return target && valid.includes(target)
          ? { target, reason: normalizeReason(parsed?.reason) }
          : { target: null, reason: normalizeReason(parsed?.reason) };
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
  return actor.playerAgent.askVoteTarget(prompt, valid, options);
}

function askJson(actor: SkillAgent, prompt: string, options: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  return actor.playerAgent.askJson(prompt, options);
}

function parseTargetSeat(parsed: Record<string, unknown> | null | undefined): number | null {
  const target = Number(parsed?.targetSeat ?? parsed?.target);
  return Number.isFinite(target) && target > 0 ? target : null;
}

function normalizeReason(value: unknown): string | null {
  const reason = String(value || '').trim().slice(0, 80);
  return reason || null;
}

function normalizeGift(value: unknown): string | null {
  const gift = String(value || '').trim();
  if (gift === 'inspectFaction' || gift === 'check' || gift === 'seer') return 'inspectFaction';
  if (gift === 'poison' || gift === 'witch_poison') return 'poison';
  if (gift === 'shootOnDeath' || gift === 'gun' || gift === 'hunter_shot') return 'shootOnDeath';
  return null;
}

function isWhiteWolfKing(actor: SkillAgent): boolean {
  const roleId = String(actor.role || actor.roleConfig?.id || '').toLowerCase();
  const roleName = String(actor.roleLabel || actor.roleConfig?.name || '').toLowerCase();
  return roleId === 'white_wolf_king' || roleName.includes('白狼王') || roleName.includes('white wolf king');
}

export { createWerewolfSkillRegistry, createWerewolfSkills };
