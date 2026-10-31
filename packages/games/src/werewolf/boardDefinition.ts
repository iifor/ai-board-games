import { z } from 'zod';
import { describeRules } from './roleRules';

// 板子的定义格式与板子参数；板子清单在 boards.ts（及各批次的清单文件）中登记。

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
  /** 黑商口径：first_night 首夜第一个睁眼且必须交易；any_night 任意一晚（在预言家、女巫之后）可以交易一次 */
  blackMerchant: z.enum(['first_night', 'any_night']).default('first_night'),
});
export type BoardConfig = z.infer<typeof boardConfigSchema>;

export interface BoardPlayers {
  readonly min: number;
  readonly max: number;
}

/** 没有声明人数的板子都是 12 人 */
export const DEFAULT_BOARD_PLAYERS: BoardPlayers = { min: 12, max: 12 };

export interface BoardDefinition {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  /** 给 AI 的板子规则说明（会进入 L2 规则层） */
  readonly rules: string;
  /** 发给座位的角色（有底牌的板子是去掉底牌前的默认分配，见 extraCards） */
  readonly roles: Readonly<Record<string, number | 'rest'>>;
  readonly players?: BoardPlayers;
  /**
   * 牌堆中多出座位数的牌（盗贼板子的两张底牌）：开局从 roles + extraCards 组成的牌堆中抽出同样数量的底牌，
   * 其余发给座位（见 rules/deal.ts）
   */
  readonly extraCards?: Readonly<Record<string, number>>;
  readonly config?: z.input<typeof boardConfigSchema>;
}

/** 规则说明由角色表与板子参数自动拼出（见 roleRules.ts） */
export function defineBoard(definition: Omit<BoardDefinition, 'rules'>): BoardDefinition {
  return { ...definition, rules: describeRules(definition.roles, boardConfigSchema.parse(definition.config ?? {})) };
}
