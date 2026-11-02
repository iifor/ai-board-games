import type { RoleCategory } from './boardDefinition';

// 角色目录（叶子数据模块）：每个角色的展示名、阵营、屠边类别与特性，基础规则与特殊角色模块都可以引用。
// 身份模板不在这里：基础角色的在 prompts.ts，特殊角色的在各自模块的描述符中登记，由 roleSpecs.ts 装配成引擎的 RoleSpec。
// 本模块不得引用 special/*，否则会重新形成 规则 → 角色目录 → 特殊角色 → 规则 的循环。

/** 角色的静态特性，规则通过 roleTraits(seat) 读取 */
export interface RoleTraits {
  /** 不能在白天发言中自爆 */
  readonly noSelfDestruct?: boolean;
  /** 免疫女巫的毒药（毒药照常消耗） */
  readonly poisonImmune?: boolean;
  /** 免疫夜间出局的猎人开的枪 */
  readonly nightShotImmune?: boolean;
  /** 狼队不认识他（隐狼）：狼刀可以选他 */
  readonly hiddenFromPack?: boolean;
  /** 预言家查验为好人，熊不会因他咆哮（隐狼） */
  readonly appearsGood?: boolean;
  /** 存活的该角色还在场时查验为好人（狼弟在狼兄出局前、火力全开的隐狼在白狼王出局前），见 rules/appearance.ts */
  readonly appearsGoodWhile?: string;
  /** 离群的狼只与该角色互相认识（狼弟与狼兄），见 rules/loneWolf.ts */
  readonly pairedWith?: string;
  /** 不受狼美人魅惑影响（老流氓） */
  readonly charmImmune?: boolean;
  /** 被毒、被枪击时延迟到次日白天发言结束才出局（老流氓） */
  readonly delayedDeath?: boolean;
}

/**
 * werewolf：狼队（互相认识、共享狼队频道）；lone_wolf：离群的狼（狼人阵营，但不在狼队频道里）；good：好人阵营；
 * ghost_bride：鬼魂新娘的第三方阵营（共享第三方频道，见 special/ghostBride.ts）
 */
export type RoleTeam = 'werewolf' | 'lone_wolf' | 'good' | 'ghost_bride';

export interface RoleEntry {
  readonly name: string;
  readonly team: RoleTeam;
  /** 屠边判定用的类别；板子可在 config.categories 中覆盖 */
  readonly category: RoleCategory;
  readonly traits: RoleTraits;
}

function role(name: string, team: RoleTeam, category: RoleCategory, traits: RoleTraits = {}): RoleEntry {
  return { name, team, category, traits };
}

/** 恶魔、恶灵骑士：免疫毒药与夜间出局的猎人的枪，不能自爆 */
const NIGHT_IMMUNE: RoleTraits = { noSelfDestruct: true, poisonImmune: true, nightShotImmune: true };

/** 火力全开的隐狼：与狼队互认、一起击杀，白狼王出局前查验为好人，不能自爆 */
const PACK_HIDDEN_WOLF: RoleTraits = { noSelfDestruct: true, appearsGoodWhile: 'white_wolf_king' };

/** 狼弟：只与狼兄相认，狼队不认识他；狼兄出局前查验为好人 */
const YOUNGER_BROTHER: RoleTraits = { hiddenFromPack: true, appearsGoodWhile: 'wolf_elder_brother', pairedWith: 'wolf_elder_brother' };

/** 全部板子用到的角色；新增特殊角色时在此登记，身份模板在该角色模块的描述符中登记 */
export const ROLE_CATALOG: Readonly<Record<string, RoleEntry>> = {
  werewolf: role('狼人', 'werewolf', 'wolf'),
  white_wolf_king: role('白狼王', 'werewolf', 'wolf'),
  wolf_beauty: role('狼美人', 'werewolf', 'wolf', { noSelfDestruct: true }),
  demon: role('恶魔', 'werewolf', 'wolf', NIGHT_IMMUNE),
  evil_knight: role('恶灵骑士', 'werewolf', 'wolf', NIGHT_IMMUNE),
  nightmare: role('梦魇', 'werewolf', 'wolf'),
  wolf_king: role('狼王', 'werewolf', 'wolf'),
  wild_child_wolf: role('野孩子', 'werewolf', 'wolf'),
  big_bad_wolf: role('大灰狼', 'lone_wolf', 'wolf', { noSelfDestruct: true }),
  hidden_wolf: role('隐狼', 'lone_wolf', 'wolf', { noSelfDestruct: true, hiddenFromPack: true, appearsGood: true }),
  hidden_wolf_pack: role('隐狼', 'werewolf', 'wolf', PACK_HIDDEN_WOLF),
  wolf_elder_brother: role('狼兄', 'werewolf', 'wolf'),
  wolf_younger_brother: role('狼弟', 'lone_wolf', 'wolf', YOUNGER_BROTHER),
  wolf_younger_brother_pack: role('狼弟', 'werewolf', 'wolf'),
  wolf_seed: role('种狼', 'werewolf', 'wolf'),
  infected_wolf: role('感染狼', 'werewolf', 'wolf'),
  succubus: role('魅魔', 'werewolf', 'wolf'),
  magic_wolf: role('魔狼', 'werewolf', 'wolf'),
  spirit_wolf: role('灵狼', 'werewolf', 'wolf'),
  wolf_witch: role('狼巫', 'werewolf', 'wolf'),
  seer: role('预言家', 'good', 'god'),
  witch: role('女巫', 'good', 'god'),
  hunter: role('猎人', 'good', 'god'),
  idiot: role('白痴', 'good', 'god'),
  guard: role('守卫', 'good', 'god'),
  silence_elder: role('禁言长老', 'good', 'god'),
  knight: role('骑士', 'good', 'god'),
  stalker: role('潜行者', 'good', 'god'),
  butterfly: role('花蝴蝶', 'good', 'god'),
  dreamer: role('摄梦人', 'good', 'god'),
  magician: role('魔术师', 'good', 'god'),
  fortune_teller: role('占卜师', 'good', 'god'),
  crow: role('乌鸦', 'good', 'god'),
  bear_tamer: role('驯熊师', 'good', 'god'),
  bombman: role('炸弹人', 'good', 'god'),
  nine_tailed_fox: role('九尾狐', 'good', 'god'),
  black_merchant: role('黑商', 'good', 'god'),
  bear: role('熊', 'good', 'god'),
  penguin: role('企鹅', 'good', 'god'),
  fox: role('狐狸', 'good', 'god'),
  heavenly_eye: role('天眼', 'good', 'god'),
  requester: role('祈求者', 'good', 'god'),
  demon_hunter: role('猎魔人', 'good', 'god', { poisonImmune: true }),
  illusionist: role('幻术师', 'good', 'god'),
  thief: role('盗贼', 'good', 'villager'),
  cupid: role('丘比特', 'good', 'third'),
  ghost_bride: role('鬼魂新娘', 'ghost_bride', 'third'),
  betrayer_wolf: role('叛变的狼人', 'ghost_bride', 'third'),
  hybrid: role('混血儿', 'good', 'villager'),
  old_rogue: role('老流氓', 'good', 'villager', { charmImmune: true, delayedDeath: true }),
  wild_child: role('野孩子', 'good', 'third'),
  big_tree: role('大树', 'good', 'villager'),
  villager: role('村民', 'good', 'villager'),
  rabbit: role('兔兔', 'good', 'villager'),
  sapling: role('树苗', 'good', 'villager'),
};

/** 角色的展示名；未登记的角色原样返回 key */
export function roleName(role: string): string {
  return ROLE_CATALOG[role]?.name ?? role;
}
