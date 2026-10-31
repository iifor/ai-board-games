import type { Seat, SetupContext, Visibility } from '@battle/engine';
import { z } from 'zod';
import { DEFAULT_BOARD, findBoard } from './boards';

const seatNo = z.number().int().positive();

export const seerCheckSchema = z.object({
  night: z.number().int().positive(),
  target: seatNo,
  result: z.enum(['好人', '狼人']),
});

export const pendingDeathSchema = z.object({
  seat: seatNo,
  cause: z.enum(['wolf', 'poison']),
});

export const boardInfoSchema = z.object({
  key: z.string(),
  name: z.string(),
  rules: z.string(),
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
  }),
  /** 守卫上一晚守护的人（不能连续两晚守同一人） */
  guardLastTarget: seatNo.nullable(),
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
});

export type WerewolfState = z.infer<typeof werewolfStateSchema>;
export type WerewolfParams = Record<string, never>;
export type PendingDeath = z.infer<typeof pendingDeathSchema>;

const witchOnly: Visibility = {
  project: (value: unknown, viewer: Seat) => (viewer.role === 'witch' ? value : undefined),
};

/** 预言家只能看到自己的查验记录；还没查验时为空列表 */
const ownChecks: Visibility = {
  project: (value: unknown, viewer: Seat) => {
    if (viewer.role !== 'seer' || value === null || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[String(viewer.seat)] ?? [];
  },
};

export const werewolfVisibility = {
  board: 'public',
  guardLastTarget: { project: (value: unknown, viewer: Seat) => (viewer.role === 'guard' ? value : undefined) },
  potions: witchOnly,
  lastNightDeaths: 'public',
  seerChecks: ownChecks,
  sheriff: 'public',
  sheriffCandidates: 'public',
  idiotRevealed: 'public',
} as const satisfies { readonly [K in keyof WerewolfState]?: Visibility };

export function initialWerewolfState(ctx: SetupContext<WerewolfParams>): WerewolfState {
  const board = findBoard(ctx.variant?.key ?? DEFAULT_BOARD);
  return {
    board: { key: board.key, name: board.name, rules: board.rules },
    night: { wolfTarget: null, saved: false, poisoned: null, guarded: null },
    guardLastTarget: null,
    pendingBlast: null,
    potions: { antidote: true, poison: true },
    pendingDeaths: [],
    lastNightDeaths: [],
    seerChecks: {},
    sheriff: null,
    sheriffCandidates: [],
    speechStart: null,
    idiotRevealed: false,
    exileTarget: null,
    pendingShot: null,
    winnerLock: null,
    mvp: null,
  };
}
