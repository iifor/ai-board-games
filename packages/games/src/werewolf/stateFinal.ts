import { z } from 'zod';

// 第四批特殊角色（魔狼、猎魔人）的状态字段，由 state.ts 合并进狼人杀状态。

const seatNo = z.number().int().positive();

/** 当晚的临时决定：入夜时随 night 一起重置（白天仍保留当晚的记录） */
export const finalNightShape = {
  /** 猎魔人今晚狩猎的人 */
  hunted: seatNo.nullable(),
};

export const finalStateShape = {
  /** 魔狼自爆后的那一晚（天数）：当晚所有神职的夜间技能被封印（公开） */
  godsSealedNight: z.number().int().positive().nullable(),
  /** 魔狼作为最后一名狼人被放逐时翻牌存活：这一天天亮后出局，在此之前不能投票（公开） */
  magicWolfDoom: z.number().int().positive().nullable(),
};

export const finalVisibility = {
  godsSealedNight: 'public',
  magicWolfDoom: 'public',
} as const;

export function emptyFinalNight() {
  return { hunted: null } as const;
}

export function initialFinalState() {
  return {
    godsSealedNight: null,
    magicWolfDoom: null,
  };
}
