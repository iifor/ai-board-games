import type { Seat, Visibility } from '@battle/engine';
import { z } from 'zod';
import { seerResultSchema } from './stateFinal';
import { ownList, roleOnly } from './stateVisibility';

// 第三批特殊角色（黑商、大树、狼兄弟、企鹅、狐狸、熊、种狼、天眼、祈求者、盗贼、丘比特、魅魔、鬼魂新娘）的状态字段，
// 由 state.ts 合并进狼人杀状态。

const seatNo = z.number().int().positive();

/** 可以赠送 / 祈求得到的额外技能：预言家的验、猎人的枪、女巫的毒 */
export const giftSkillSchema = z.enum(['check', 'gun', 'poison']);
export type GiftSkill = z.infer<typeof giftSkillSchema>;

/** 尚未使用的额外技能（不存展示文字：规则层模板按开关写出，避免与公开规则文字重复） */
export const giftSetSchema = z.object({ check: z.boolean(), gun: z.boolean(), poison: z.boolean() });
export type GiftSet = z.infer<typeof giftSetSchema>;
export const NO_GIFTS: GiftSet = { check: false, gun: false, poison: false };

export const giftCheckSchema = z.object({
  night: z.number().int().positive(),
  target: seatNo,
  result: seerResultSchema,
});

export const foxCheckSchema = z.object({
  night: z.number().int().positive(),
  seats: z.array(seatNo),
  hasWolf: z.boolean(),
});

export const roleCheckSchema = z.object({
  night: z.number().int().positive(),
  target: seatNo,
  role: z.string(),
});

/** 第三方阵营：lovers 为情侣一方（人狼恋的丘比特与情侣、魅魔与情侣、鬼魂新娘与新郎和证婚人），requester 为祈求者 */
export const thirdPartySchema = z.object({
  kind: z.enum(['lovers', 'requester']),
  seats: z.array(seatNo),
  /** 核心成员：全部出局后第三方失败，其余成员回到普通胜负（丘比特的第三方以情侣为核心，其他第三方是全部成员） */
  core: z.array(seatNo),
});
export type ThirdParty = z.infer<typeof thirdPartySchema>;

export const thiefSchema = z.object({
  /** 本局的盗贼；盗贼牌被抽作底牌时为 null */
  seat: seatNo.nullable(),
  /** 两张底牌的角色 key（按牌堆顺序） */
  cards: z.array(z.string()),
  /** 两张底牌的展示名（带书名号，避免与公开规则里的角色名相同而被当作泄露） */
  first: z.string(),
  second: z.string(),
});

/** 当晚的临时决定：入夜时随 night 一起重置 */
export const extendedNightShape = {
  /** 企鹅今晚冰冻的人：当晚夜间技能失效 */
  frozen: seatNo.nullable(),
  /** 用赠送 / 祈求得到的毒药今晚毒的人 */
  giftPoisoned: seatNo.nullable(),
  /** 黑商今晚选择的技能（依次询问验、枪，都不选则为毒） */
  merchantSkill: giftSkillSchema.nullable(),
  /** 黑商今晚把技能交给了狼人：天亮时黑商出局 */
  merchantBackfire: z.boolean(),
  /** 种狼今晚对狼刀目标发动了感染 */
  infecting: z.boolean(),
  /** 狼弟今晚单独击杀的人 */
  brotherTarget: seatNo.nullable(),
  /** 第三方（祈求者、鬼魂新娘一方）今晚击杀的人 */
  thirdKill: seatNo.nullable(),
};

export const extendedStateShape = {
  /** 企鹅上一晚冰冻的人（不能连续两晚冰同一人） */
  penguinLastTarget: seatNo.nullable(),
  /** 狐狸查验的三人中没有狼人：永远失去查验能力 */
  foxLost: z.boolean(),
  foxChecks: z.array(foxCheckSchema),
  heavenlyEyeChecks: z.array(roleCheckSchema),
  /** 大树已经被狼刀中的次数（第二次才会出局） */
  bigTreeHits: z.number().int().nonnegative(),
  /** 大树因狼刀与白狼王自爆以外的原因出局：其余神职从此失去技能（公开） */
  godsDisabled: z.boolean(),
  /** 黑商的交易：是否已经用过、本次交易的对象 */
  merchant: z.object({ used: z.boolean(), target: seatNo.nullable() }),
  /** 座位 → 尚未使用的额外技能（幸运儿、祈求者） */
  gifts: z.record(z.string(), giftSetSchema),
  /** 座位 → 用额外技能查验的记录 */
  giftChecks: z.record(z.string(), z.array(giftCheckSchema)),
  /** 狼兄出局的那一天 */
  elderFellOn: z.number().int().positive().nullable(),
  wolfSeedUsed: z.boolean(),
  /** 祈求者首夜祈求的结果 */
  requesterGift: z.enum(['double', 'gun', 'poison', 'check', 'third']).nullable(),
  /** 盗贼板子开局抽出的两张底牌 */
  thief: thiefSchema.nullable(),
  /** 一方出局时另一方殉情的两人 */
  lovers: z.array(seatNo),
  thirdParty: thirdPartySchema.nullable(),
  /** 座位 → 法官私下告诉他的固定信息（情侣、幸运儿等），在规则层展示给本人 */
  seatNotes: z.record(z.string(), z.array(z.string())),
};

/** 盗贼的底牌只有盗贼本人看得到 */
const ownThief: Visibility = {
  project: (value: unknown, viewer: Seat) => {
    if (value === null || typeof value !== 'object') return undefined;
    return (value as { seat?: unknown }).seat === viewer.seat ? value : undefined;
  },
};

/** 每个座位只看到自己的额外技能；没有时为全 false */
const ownGifts: Visibility = {
  project: (value: unknown, viewer: Seat) => {
    if (value === null || typeof value !== 'object') return NO_GIFTS;
    return (value as Record<string, unknown>)[String(viewer.seat)] ?? NO_GIFTS;
  },
};

export const extendedVisibility = {
  penguinLastTarget: roleOnly('penguin'),
  foxLost: roleOnly('fox'),
  foxChecks: roleOnly('fox'),
  heavenlyEyeChecks: roleOnly('heavenly_eye'),
  bigTreeHits: roleOnly('big_tree'),
  godsDisabled: 'public',
  merchant: roleOnly('black_merchant'),
  gifts: ownGifts,
  giftChecks: ownList,
  wolfSeedUsed: roleOnly('wolf_seed'),
  requesterGift: roleOnly('requester'),
  thief: ownThief,
  seatNotes: ownList,
} as const;

export function emptyExtendedNight() {
  return {
    frozen: null,
    giftPoisoned: null,
    merchantSkill: null,
    merchantBackfire: false,
    infecting: false,
    brotherTarget: null,
    thirdKill: null,
  } as const;
}

export function initialExtendedState(thief: z.infer<typeof thiefSchema> | null) {
  return {
    penguinLastTarget: null,
    foxLost: false,
    foxChecks: [],
    heavenlyEyeChecks: [],
    bigTreeHits: 0,
    godsDisabled: false,
    merchant: { used: false, target: null },
    gifts: {},
    giftChecks: {},
    elderFellOn: null,
    wolfSeedUsed: false,
    requesterGift: null,
    thief,
    lovers: [],
    thirdParty: null,
    seatNotes: thief?.seat ? { [String(thief.seat)]: [`法官手中的两张底牌是：${thief.first}、${thief.second}。`] } : {},
  };
}
