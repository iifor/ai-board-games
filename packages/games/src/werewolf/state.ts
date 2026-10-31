import type { Visibility } from '@battle/engine';
import { z } from 'zod';
import { emptyExtendedNight, extendedNightShape, extendedStateShape, extendedVisibility } from './stateExtended';
import { emptyExtraNight, extraNightShape, extraStateShape, extraVisibility } from './stateExtras';
import { emptyFinalNight, finalNightShape, finalStateShape, finalVisibility } from './stateFinal';
import { ownChecks, roleOnly } from './stateVisibility';

const seatNo = z.number().int().positive();

export const seerCheckSchema = z.object({
  night: z.number().int().positive(),
  target: seatNo,
  result: z.enum(['好人', '狼人']),
});

/**
 * 夜间死亡的原因；天亮出局时作为触发器的 cause。
 * merchant：黑商把技能交给了狼人；lover：情侣殉情；third_kill：第三方（祈求者、鬼魂新娘一方）的击杀；hunt：猎魔人的狩猎。
 */
export const nightDeathCauseSchema = z.enum(['wolf', 'poison', 'reflect', 'stalker', 'charm', 'dream', 'merchant', 'lover', 'third_kill', 'hunt']);

export const demonCheckSchema = z.object({
  night: z.number().int().positive(),
  target: seatNo,
  result: z.enum(['神职', '平民']),
});

export const pendingDeathSchema = z.object({
  seat: seatNo,
  cause: nightDeathCauseSchema,
});

export const boardInfoSchema = z.object({
  key: z.string(),
  name: z.string(),
  rules: z.string(),
  /** 本局人数 */
  players: z.number().int().positive(),
});

export const werewolfStateSchema = z.object({
  /** 本局板子（公开） */
  board: boardInfoSchema,
  /** 当晚的临时决定，入夜时重置 */
  night: z.object({
    wolfTarget: seatNo.nullable(),
    saved: z.boolean(),
    poisoned: seatNo.nullable(),
    guarded: seatNo.nullable(),
    /** 禁言长老今晚禁言的人，天亮时公布 */
    silenced: seatNo.nullable(),
    /** 花蝴蝶今晚抱的人：当晚夜间技能失效 */
    hugged: seatNo.nullable(),
    /** 梦魇今晚恐惧的人：当晚夜间技能失效，猎人当晚被狼刀时不能开枪 */
    feared: seatNo.nullable(),
    /** 潜行者今晚暗杀的人 */
    stalked: seatNo.nullable(),
    /** 狼美人今晚魅惑的人：狼美人当晚或次日白天出局时殉情；下一晚入夜时清空 */
    charmed: seatNo.nullable(),
    ...extraNightShape,
    ...extendedNightShape,
    ...finalNightShape,
  }),
  /** 守卫上一晚守护的人（不能连续两晚守同一人） */
  guardLastTarget: seatNo.nullable(),
  /** 混血儿选择的主人 */
  hybridMaster: seatNo.nullable(),
  /** 禁言长老上一晚禁言的人（不能连续两晚禁言同一人） */
  elderLastTarget: seatNo.nullable(),
  /** 今天白天被禁言的人（天亮公布，入夜清空） */
  silencedToday: seatNo.nullable(),
  knightDuelUsed: z.boolean(),
  stalkerUsed: z.boolean(),
  /** 潜行者在当天放逐投票中投给的人；当晚可暗杀（若他没有出局），夜里用过即清空 */
  stalkerVote: seatNo.nullable(),
  /** 花蝴蝶已经抱人的次数 */
  butterflyHugs: z.number().int().nonnegative(),
  demonChecks: z.array(demonCheckSchema),
  /** 恶灵骑士的反伤已经发动过（全场一次） */
  evilKnightReflected: z.boolean(),
  /** 梦魇上一晚恐惧的人（不能连续两晚恐惧同一人） */
  nightmareLastTarget: seatNo.nullable(),
  /** 白狼王自爆时选择带走的人，等待结算 */
  pendingBlast: seatNo.nullable(),
  potions: z.object({ antidote: z.boolean(), poison: z.boolean() }),
  /** 夜间结算出的死亡，天亮公布时才真正出局 */
  pendingDeaths: z.array(pendingDeathSchema),
  /** 最近一次天亮公布的死者 */
  lastNightDeaths: z.array(seatNo),
  seerChecks: z.record(z.string(), z.array(seerCheckSchema)),
  sheriff: seatNo.nullable(),
  sheriffCandidates: z.array(seatNo),
  /** 当天白天发言的起点；null 表示按默认规则 */
  speechStart: seatNo.nullable(),
  idiotRevealed: z.boolean(),
  /** 放逐投票的结果，等待结算 */
  exileTarget: seatNo.nullable(),
  /** 猎人开枪目标，等待结算 */
  pendingShot: seatNo.nullable(),
  /** 狼刀本身已达成狼人胜利条件时锁定胜负，同夜毒杀或枪杀最后一名狼人也不改变结果 */
  winnerLock: z.enum(['werewolf']).nullable(),
  mvp: seatNo.nullable(),
  ...extraStateShape,
  ...extendedStateShape,
  ...finalStateShape,
});

export type WerewolfState = z.infer<typeof werewolfStateSchema>;
export type WerewolfParams = Record<string, never>;
export type PendingDeath = z.infer<typeof pendingDeathSchema>;
export type NightDeathCause = z.infer<typeof nightDeathCauseSchema>;

/** 天亮出局时使用这些原因，可据此区分夜间死亡与白天死亡 */
export const NIGHT_DEATH_CAUSES: ReadonlySet<string> = new Set(nightDeathCauseSchema.options);

export const werewolfVisibility = {
  board: 'public',
  guardLastTarget: roleOnly('guard'),
  hybridMaster: roleOnly('hybrid'),
  elderLastTarget: roleOnly('silence_elder'),
  silencedToday: 'public',
  knightDuelUsed: roleOnly('knight'),
  stalkerUsed: roleOnly('stalker'),
  stalkerVote: roleOnly('stalker'),
  butterflyHugs: roleOnly('butterfly'),
  demonChecks: roleOnly('demon'),
  nightmareLastTarget: roleOnly('nightmare'),
  potions: roleOnly('witch'),
  lastNightDeaths: 'public',
  seerChecks: ownChecks,
  sheriff: 'public',
  sheriffCandidates: 'public',
  idiotRevealed: 'public',
  ...extraVisibility,
  ...extendedVisibility,
  ...finalVisibility,
} as const satisfies { readonly [K in keyof WerewolfState]?: Visibility };

export function emptyNight(): WerewolfState['night'] {
  return {
    wolfTarget: null,
    saved: false,
    poisoned: null,
    guarded: null,
    silenced: null,
    hugged: null,
    feared: null,
    stalked: null,
    charmed: null,
    ...emptyExtraNight(),
    ...emptyExtendedNight(),
    ...emptyFinalNight(),
  };
}
