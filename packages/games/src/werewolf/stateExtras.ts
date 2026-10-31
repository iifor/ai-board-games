import { z } from 'zod';
import { ownList, roleOnly } from './stateVisibility';

// 第二批特殊角色（狼王、摄梦人、魔术师、大灰狼、占卜师、隐狼、乌鸦、驯熊师、野孩子、炸弹人、九尾狐、老流氓）的状态字段，
// 由 state.ts 合并进狼人杀状态。

const seatNo = z.number().int().positive();

/** 当晚的临时决定：入夜时随 night 一起重置 */
export const extraNightShape = {
  /** 摄梦人今晚摄梦的人（梦游者） */
  dreamed: seatNo.nullable(),
  /** 今晚的摄梦对象与上一晚相同：梦游者当晚死亡 */
  dreamRepeat: z.boolean(),
  /** 魔术师今晚交换的两个号码：当晚作用在这两个号码上的技能结果互换 */
  swapped: z.tuple([seatNo, seatNo]).nullable(),
  /** 占卜师今晚标记的号码：狼人只能击杀它及左右相邻号码 */
  marked: seatNo.nullable(),
  /** 大灰狼今晚发动了单独击杀（之后才得知标记、且必须落刀） */
  bigBadWolfArmed: z.boolean(),
  bigBadWolfTarget: seatNo.nullable(),
  /** 乌鸦今晚诅咒的人：次日放逐投票中额外得票 */
  cursed: seatNo.nullable(),
};

export const rogueWoundSchema = z.object({
  seat: seatNo,
  /** 这一天的白天发言结束后出局 */
  dueDay: z.number().int().positive(),
  /** true：被猎人枪击（已公布负伤）；false：被女巫毒（不公布） */
  shot: z.boolean(),
});

export const extraStateShape = {
  /** 摄梦人上一晚摄梦的人：连续两晚摄梦同一人会让他死亡 */
  dreamerLastTarget: seatNo.nullable(),
  /** 已被魔术师交换过的号码（每个号码全场只能被交换一次） */
  magicianSwapped: z.array(seatNo),
  fortuneMarkUsed: z.boolean(),
  bigBadWolfUsed: z.boolean(),
  /** 狼人阵营里不靠队友身份可见性得知的同伴（座位 → 座位列表，只有本人可见）：离群的狼与狼队之间 */
  knownWolves: z.record(z.string(), z.array(seatNo)),
  /** 乌鸦上一晚诅咒的人（不能连续两晚诅咒同一人） */
  crowLastTarget: seatNo.nullable(),
  /** 入夜前判定的熊咆哮状态，天亮时公布 */
  bearRoars: z.boolean(),
  /** 野孩子选择的榜样 */
  wildChildModel: seatNo.nullable(),
  /** 炸弹人引爆时同时炸死了所有狼人和一整边好人：炸弹人单独获胜 */
  bombmanWin: z.boolean(),
  /** 九尾狐最近一次在夜里查看到的尾巴数 */
  foxTailsSeen: z.number().int().nonnegative(),
  /** 老流氓中毒或负伤：到期当天白天发言结束后出局 */
  rogueWound: rogueWoundSchema.nullable(),
};

export const extraVisibility = {
  dreamerLastTarget: roleOnly('dreamer'),
  magicianSwapped: roleOnly('magician'),
  fortuneMarkUsed: roleOnly('fortune_teller'),
  bigBadWolfUsed: roleOnly('big_bad_wolf'),
  knownWolves: ownList,
  crowLastTarget: roleOnly('crow'),
  wildChildModel: roleOnly('wild_child', 'wild_child_wolf'),
  foxTailsSeen: roleOnly('nine_tailed_fox'),
} as const;

export const FOX_TAILS = 9;

export function emptyExtraNight() {
  return {
    dreamed: null,
    dreamRepeat: false,
    swapped: null,
    marked: null,
    bigBadWolfArmed: false,
    bigBadWolfTarget: null,
    cursed: null,
  } as const;
}

export function initialExtraState(knownWolves: Record<string, number[]>) {
  return {
    dreamerLastTarget: null,
    magicianSwapped: [],
    fortuneMarkUsed: false,
    bigBadWolfUsed: false,
    knownWolves,
    crowLastTarget: null,
    bearRoars: false,
    wildChildModel: null,
    bombmanWin: false,
    foxTailsSeen: FOX_TAILS,
    rogueWound: null,
  };
}
