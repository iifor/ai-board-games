import { z } from 'zod';
import { roleOnly } from './stateVisibility';

// 第四批特殊角色（魔狼、猎魔人、灵狼、狼巫、幻术师）的状态字段与预言家式查验的结果，由 state.ts 合并进狼人杀状态。

const seatNo = z.number().int().positive();

/**
 * 预言家式查验（预言家、额外的查验）的结果；被灵狼庇护的玩家当晚查验不出结果。
 * 这个结果文字不要出现在公开规则或其他人能看到的模板里（泄露检查按文本比对）。
 */
export const SEER_NO_RESULT = '无法验出';
export const seerResultSchema = z.enum(['好人', '狼人', SEER_NO_RESULT]);
export type SeerResult = z.infer<typeof seerResultSchema>;

/** 灵狼首夜学到的技能：预言家、女巫、猎人、守卫之外的身份都算平民 */
export const spiritSkillSchema = z.enum(['seer', 'witch', 'hunter', 'guard', 'villager']);
export type SpiritSkill = z.infer<typeof spiritSkillSchema>;

export const spiritWolfSchema = z.object({
  learned: spiritSkillSchema.nullable(),
  /** 学到女巫时获得的解毒剂尚未使用 */
  antidote: z.boolean(),
  /** 上一晚庇护的人（不能连续两晚庇护同一人） */
  lastShield: seatNo.nullable(),
  /** 学到预言家后查验神职 / 平民的记录 */
  checks: z.array(z.object({ night: z.number().int().positive(), target: seatNo, result: z.enum(['神职', '平民']) })),
});

/** 当晚的临时决定：入夜时随 night 一起重置（白天仍保留当晚的记录） */
export const finalNightShape = {
  /** 猎魔人今晚狩猎的人 */
  hunted: seatNo.nullable(),
  /** 灵狼今晚庇护的人：当晚免疫狼刀、毒药与夜间开枪，预言家查验不出结果 */
  spiritShield: seatNo.nullable(),
  /** 灵狼今晚用解毒剂解救的人（女巫今晚毒的号码） */
  spiritAntidote: seatNo.nullable(),
  /** 狼巫今晚诅咒的人：直到下一个夜晚到来之前不能发动任何技能（白天仍保留，下一晚入夜时随 night 清空） */
  hexed: seatNo.nullable(),
  /** 幻术师今晚的幻象：幻术师当晚被狼刀或毒杀时由幻象代替死亡 */
  phantom: seatNo.nullable(),
};

export const finalStateShape = {
  /** 魔狼自爆后的那一晚（天数）：当晚所有神职的夜间技能被封印（公开） */
  godsSealedNight: z.number().int().positive().nullable(),
  /** 魔狼作为最后一名狼人被放逐时翻牌存活：这一天天亮后出局，在此之前不能投票（公开） */
  magicWolfDoom: z.number().int().positive().nullable(),
  spiritWolf: spiritWolfSchema,
  /** 狼巫最近一次诅咒的那一晚（下一晚冷却） */
  wolfWitchLastNight: z.number().int().positive().nullable(),
  /** 幻术师最近一次发动幻术的那一晚（下一晚冷却） */
  illusionLastNight: z.number().int().positive().nullable(),
};

export const finalVisibility = {
  godsSealedNight: 'public',
  magicWolfDoom: 'public',
  spiritWolf: roleOnly('spirit_wolf'),
  wolfWitchLastNight: roleOnly('wolf_witch'),
  illusionLastNight: roleOnly('illusionist'),
} as const;

export function emptyFinalNight() {
  return { hunted: null, spiritShield: null, spiritAntidote: null, hexed: null, phantom: null } as const;
}

export function initialFinalState() {
  return {
    godsSealedNight: null,
    magicWolfDoom: null,
    spiritWolf: { learned: null, antidote: false, lastShield: null, checks: [] },
    wolfWitchLastNight: null,
    illusionLastNight: null,
  };
}
