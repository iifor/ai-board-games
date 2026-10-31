import type { VariantSpec } from '@battle/engine';
import { z } from 'zod';
import { describeRules } from './roleRules';

export const ROLE_CATEGORIES = ['god', 'villager', 'wolf', 'third'] as const;
export type RoleCategory = (typeof ROLE_CATEGORIES)[number];

/** 板子级规则参数；规则通过 boardConfig(ctx) 读取 */
export const boardConfigSchema = z.object({
  witchSelfSave: z.enum(['never', 'first_night_only', 'always']).default('first_night_only'),
  sheriff: z.boolean().default(true),
  /** 覆盖角色的屠边类别（如某些板子中白痴算作民边） */
  categories: z.record(z.string(), z.enum(ROLE_CATEGORIES)).default({}),
  /** 狼美人被女巫毒杀时是否仍带走被魅惑者（狼美人&老流氓板子中削弱为 false） */
  wolfBeautyPoisonLink: z.boolean().default(true),
  /** 隐狼口径：inherit 由法官告知狼同伴、狼同伴全灭后继承击杀权；linked 与狼人互不相认、不能击杀，狼人全灭时随之出局 */
  hiddenWolf: z.enum(['inherit', 'linked']).default('inherit'),
  /** 被乌鸦诅咒者在次日放逐投票中额外获得的票数 */
  crowVotes: z.number().int().positive().default(1),
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

/** 规则说明由角色表与板子参数自动拼出（见 roleRules.ts） */
function board(definition: Omit<BoardDefinition, 'rules'>): BoardDefinition {
  return { ...definition, rules: describeRules(definition.roles, boardConfigSchema.parse(definition.config ?? {})) };
}

export const BOARDS: readonly BoardDefinition[] = [
  board({
    key: 'standard-12',
    name: '预女猎白',
    description: '12 人标准局：预言家、女巫、猎人、白痴、4 名村民对抗 4 名狼人。',
    roles: { werewolf: 4, seer: 1, witch: 1, hunter: 1, idiot: 1, villager: 'rest' },
  }),
  board({
    key: 'hybrid-12',
    name: '预女猎白混',
    description: '预女猎白加混血儿：混血儿首夜选择主人，胜负跟随主人的阵营。',
    roles: { werewolf: 4, seer: 1, witch: 1, hunter: 1, idiot: 1, hybrid: 1, villager: 'rest' },
  }),
  board({
    key: 'silence-elder-knight-12',
    name: '禁言长老&骑士',
    description: '预言家、女巫、骑士、禁言长老与 4 名村民对抗 4 名狼人。',
    roles: { werewolf: 4, seer: 1, witch: 1, knight: 1, silence_elder: 1, villager: 'rest' },
  }),
  board({
    key: 'silence-elder-stalker-12',
    name: '禁言长老&潜行者',
    description: '预言家、女巫、潜行者、禁言长老与 4 名村民对抗 4 名狼人。',
    roles: { werewolf: 4, seer: 1, witch: 1, stalker: 1, silence_elder: 1, villager: 'rest' },
  }),
  board({
    key: 'butterfly-12',
    name: '花蝴蝶',
    description: '预言家、花蝴蝶、潜行者、猎人与 4 名村民对抗 4 名狼人，没有女巫。',
    roles: { werewolf: 4, seer: 1, butterfly: 1, stalker: 1, hunter: 1, villager: 'rest' },
  }),
  board({
    key: 'white-wolf-king-guard-12',
    name: '白狼王&守卫',
    description: '白狼王与 3 名狼人对抗预言家、女巫、猎人、守卫与 4 名村民。',
    roles: { white_wolf_king: 1, werewolf: 3, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 'rest' },
  }),
  board({
    key: 'wolf-beauty-guard-12',
    name: '狼美人&守卫',
    description: '狼美人与 3 名狼人对抗预言家、女巫、猎人、守卫与 4 名村民。',
    roles: { wolf_beauty: 1, werewolf: 3, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 'rest' },
  }),
  board({
    key: 'demon-guard-12',
    name: '恶魔&守卫',
    description: '恶魔与 3 名狼人对抗预言家、女巫、猎人、守卫与 4 名村民。',
    roles: { demon: 1, werewolf: 3, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 'rest' },
  }),
  board({
    key: 'evil-knight-guard-12',
    name: '恶灵骑士&守卫',
    description: '恶灵骑士与 3 名狼人对抗预言家、女巫、猎人、守卫与 4 名村民。',
    roles: { evil_knight: 1, werewolf: 3, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 'rest' },
  }),
  board({
    key: 'nightmare-guard-12',
    name: '梦魇&守卫',
    description: '梦魇与 3 名狼人对抗预言家、女巫、猎人、守卫与 4 名村民。',
    roles: { nightmare: 1, werewolf: 3, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 'rest' },
  }),
  board({
    key: 'wolf-beauty-rogue-12',
    name: '狼美人&老流氓',
    description: '狼美人与 3 名狼人对抗预言家、女巫、猎人、白痴、老流氓与 3 名村民；本板子的狼美人被毒杀时不能带人。',
    roles: { wolf_beauty: 1, werewolf: 3, seer: 1, witch: 1, hunter: 1, idiot: 1, old_rogue: 1, villager: 'rest' },
    config: { wolfBeautyPoisonLink: false },
  }),
  board({
    key: 'wolf-king-dreamer-12',
    name: '狼王&摄梦人',
    description: '狼王与 3 名狼人对抗预言家、女巫、猎人、摄梦人与 4 名村民；猎人与狼王开枪都不翻牌。',
    roles: { wolf_king: 1, werewolf: 3, seer: 1, witch: 1, hunter: 1, dreamer: 1, villager: 'rest' },
  }),
  board({
    key: 'wolf-king-magician-12',
    name: '狼王&魔术师',
    description: '狼王与 3 名狼人对抗预言家、女巫、猎人、魔术师与 4 名村民；猎人与狼王开枪都不翻牌。',
    roles: { wolf_king: 1, werewolf: 3, seer: 1, witch: 1, hunter: 1, magician: 1, villager: 'rest' },
  }),
  board({
    key: 'big-bad-wolf-fortune-teller-12',
    name: '大灰狼&占卜师',
    description: '大灰狼与 3 名狼人对抗预言家、女巫、猎人、占卜师与 4 名村民；大灰狼离群行动，全场可单独击杀一次。',
    roles: { big_bad_wolf: 1, werewolf: 3, seer: 1, witch: 1, hunter: 1, fortune_teller: 1, villager: 'rest' },
  }),
  board({
    key: 'hidden-wolf-crow-12',
    name: '隐狼&乌鸦',
    description: '隐狼与 3 名狼人对抗预言家、女巫、猎人、乌鸦与 4 名村民；隐狼查验为好人，狼同伴全灭后继承击杀权。',
    roles: { hidden_wolf: 1, werewolf: 3, seer: 1, witch: 1, hunter: 1, crow: 1, villager: 'rest' },
    config: { hiddenWolf: 'inherit' },
  }),
  board({
    key: 'bear-tamer-hidden-wolf-12',
    name: '驯熊师&隐狼',
    description: '隐狼与 3 名狼人对抗驯熊师、女巫、猎人、白痴与 4 名村民；隐狼与狼人互不相认，狼人全灭时随之出局。',
    roles: { hidden_wolf: 1, werewolf: 3, bear_tamer: 1, witch: 1, hunter: 1, idiot: 1, villager: 'rest' },
    config: { hiddenWolf: 'linked' },
  }),
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
