import type { VariantSpec } from '@battle/engine';
import { z } from 'zod';

export const ROLE_CATEGORIES = ['god', 'villager', 'wolf', 'third'] as const;
export type RoleCategory = (typeof ROLE_CATEGORIES)[number];

/** 板子级规则参数；规则通过 boardConfig(ctx) 读取 */
export const boardConfigSchema = z.object({
  witchSelfSave: z.enum(['never', 'first_night_only', 'always']).default('first_night_only'),
  sheriff: z.boolean().default(true),
  /** 覆盖角色的屠边类别（如某些板子中白痴算作民边） */
  categories: z.record(z.string(), z.enum(ROLE_CATEGORIES)).default({}),
});
export type BoardConfig = z.infer<typeof boardConfigSchema>;

export interface BoardDefinition {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  /** 给 AI 的板子规则说明（会进入 L2 规则层） */
  readonly rules: string;
  readonly roles: Readonly<Record<string, number | 'rest'>>;
  readonly config?: z.input<typeof boardConfigSchema>;
}

const COMMON_RULES = [
  '狼人每晚共同击杀一名玩家；预言家每晚查验一名玩家的阵营；女巫有一瓶解药和一瓶毒药，同一晚只能使用一瓶。',
  '猎人出局时可以开枪带走一名玩家（被女巫毒杀时不能开枪）。',
  '第一天白天先竞选警长，警长拥有 1.5 票并决定发言顺序，出局时可移交或撕毁警徽。',
  '狼人可以在自己的白天发言中宣布自爆：自爆者出局，当天放逐取消，直接进入黑夜。',
];

export const BOARDS: readonly BoardDefinition[] = [
  {
    key: 'standard-12',
    name: '预女猎白',
    description: '12 人标准局：预言家、女巫、猎人、白痴、4 名村民对抗 4 名狼人。',
    rules: [...COMMON_RULES, '白痴被放逐时翻牌免于出局，但此后失去投票权。'].join('\n'),
    roles: { werewolf: 4, seer: 1, witch: 1, hunter: 1, idiot: 1, villager: 'rest' },
  },
  {
    key: 'white-wolf-king-guard-12',
    name: '白狼王&守卫',
    description: '白狼王与 3 名狼人对抗预言家、女巫、猎人、守卫与 4 名村民。',
    rules: [
      ...COMMON_RULES,
      '白狼王是特殊的狼人，自爆时可以带走一名玩家。',
      '守卫每晚可以守护一名玩家（可以守自己，也可以空守），但不能连续两晚守护同一人；被守护的人当晚不会被狼人杀死；若被守护的人同时被女巫解药救下，反而会死亡。',
    ].join('\n'),
    roles: { white_wolf_king: 1, werewolf: 3, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 'rest' },
  },
];

export const DEFAULT_BOARD = 'standard-12';

export function findBoard(key: string): BoardDefinition {
  const board = BOARDS.find((item) => item.key === key);
  if (!board) throw new Error(`未知的狼人杀板子：${key}`);
  return board;
}

export function boardVariants(): Record<string, VariantSpec> {
  return Object.fromEntries(BOARDS.map((board) => [board.key, {
    name: board.name,
    description: board.description,
    assign: board.roles,
    config: boardConfigSchema.parse(board.config ?? {}),
  }]));
}
