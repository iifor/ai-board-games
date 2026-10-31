import type { PromptTemplate, RoleSpec } from '@battle/engine';
import type { RoleCategory } from './boardDefinition';
import { werewolfPrompts as prompts } from './prompts';
import { bearTamerPrompts } from './special/bearTamer';
import { bigBadWolfPrompts } from './special/bigBadWolf';
import { bigTreePrompts } from './special/bigTree';
import { blackMerchantPrompts } from './special/blackMerchant';
import { bombmanPrompts } from './special/bombman';
import { butterflyPrompts } from './special/butterfly';
import { crowPrompts } from './special/crow';
import { demonPrompts } from './special/demon';
import { dreamerPrompts } from './special/dreamer';
import { evilKnightPrompts } from './special/evilKnight';
import { fortuneTellerPrompts } from './special/fortuneTeller';
import { guardPrompts } from './special/guard';
import { hiddenWolfPrompts } from './special/hiddenWolf';
import { hybridPrompts } from './special/hybrid';
import { knightPrompts } from './special/knight';
import { magicianPrompts } from './special/magician';
import { nightmarePrompts } from './special/nightmare';
import { nineTailedFoxPrompts } from './special/nineTailedFox';
import { oldRoguePrompts } from './special/oldRogue';
import { silenceElderPrompts } from './special/silenceElder';
import { stalkerPrompts } from './special/stalker';
import { whiteWolfKingPrompts } from './special/whiteWolfKing';
import { wildChildPrompts } from './special/wildChild';
import { wolfBeautyPrompts } from './special/wolfBeauty';
import { wolfBrothersPrompts } from './special/wolfBrothers';
import { wolfKingPrompts } from './special/wolfKing';

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
  /** 存活的该角色还在场时查验为好人（狼弟在狼兄出局前），见 rules/appearance.ts */
  readonly appearsGoodWhile?: string;
  /** 离群的狼只与该角色互相认识（狼弟与狼兄），见 rules/loneWolf.ts */
  readonly pairedWith?: string;
  /** 不受狼美人魅惑影响（老流氓） */
  readonly charmImmune?: boolean;
  /** 被毒、被枪击时延迟到次日白天发言结束才出局（老流氓） */
  readonly delayedDeath?: boolean;
}

export interface RoleEntry {
  readonly spec: RoleSpec;
  /** 屠边判定用的类别；板子可在 config.categories 中覆盖 */
  readonly category: RoleCategory;
  readonly traits: RoleTraits;
}

/** werewolf：狼队（互相认识、共享狼队频道）；lone_wolf：离群的狼（狼人阵营，但不在狼队频道里）；good：好人阵营 */
type RoleTeam = 'werewolf' | 'lone_wolf' | 'good';

function role(name: string, team: RoleTeam, identity: PromptTemplate, category: RoleCategory, traits: RoleTraits = {}): RoleEntry {
  return { spec: { name, team, identity, ...(team === 'werewolf' ? { knowsTeammates: true } : {}) }, category, traits };
}

/** 恶魔、恶灵骑士：免疫毒药与夜间出局的猎人的枪，不能自爆 */
const NIGHT_IMMUNE: RoleTraits = { noSelfDestruct: true, poisonImmune: true, nightShotImmune: true };

/** 狼弟：只与狼兄相认，狼队不认识他；狼兄出局前查验为好人 */
const YOUNGER_BROTHER: RoleTraits = { hiddenFromPack: true, appearsGoodWhile: 'wolf_elder_brother', pairedWith: 'wolf_elder_brother' };

/** 全部板子用到的角色；新增特殊角色时在此登记 */
function buildCatalog(): Readonly<Record<string, RoleEntry>> {
  return {
    werewolf: role('狼人', 'werewolf', prompts.werewolf, 'wolf'),
    white_wolf_king: role('白狼王', 'werewolf', whiteWolfKingPrompts.whiteWolfKing, 'wolf'),
    wolf_beauty: role('狼美人', 'werewolf', wolfBeautyPrompts.wolfBeauty, 'wolf', { noSelfDestruct: true }),
    demon: role('恶魔', 'werewolf', demonPrompts.demon, 'wolf', NIGHT_IMMUNE),
    evil_knight: role('恶灵骑士', 'werewolf', evilKnightPrompts.evilKnight, 'wolf', NIGHT_IMMUNE),
    nightmare: role('梦魇', 'werewolf', nightmarePrompts.nightmare, 'wolf'),
    wolf_king: role('狼王', 'werewolf', wolfKingPrompts.wolfKing, 'wolf'),
    wild_child_wolf: role('野孩子', 'werewolf', wildChildPrompts.wildChildWolf, 'wolf'),
    big_bad_wolf: role('大灰狼', 'lone_wolf', bigBadWolfPrompts.bigBadWolf, 'wolf', { noSelfDestruct: true }),
    hidden_wolf: role('隐狼', 'lone_wolf', hiddenWolfPrompts.hiddenWolf, 'wolf', { noSelfDestruct: true, hiddenFromPack: true, appearsGood: true }),
    wolf_elder_brother: role('狼兄', 'werewolf', wolfBrothersPrompts.wolfElderBrother, 'wolf'),
    wolf_younger_brother: role('狼弟', 'lone_wolf', wolfBrothersPrompts.wolfYoungerBrother, 'wolf', YOUNGER_BROTHER),
    wolf_younger_brother_pack: role('狼弟', 'werewolf', wolfBrothersPrompts.wolfYoungerBrotherPack, 'wolf'),
    seer: role('预言家', 'good', prompts.seer, 'god'),
    witch: role('女巫', 'good', prompts.witch, 'god'),
    hunter: role('猎人', 'good', prompts.hunter, 'god'),
    idiot: role('白痴', 'good', prompts.idiot, 'god'),
    guard: role('守卫', 'good', guardPrompts.guard, 'god'),
    silence_elder: role('禁言长老', 'good', silenceElderPrompts.silenceElder, 'god'),
    knight: role('骑士', 'good', knightPrompts.knight, 'god'),
    stalker: role('潜行者', 'good', stalkerPrompts.stalker, 'god'),
    butterfly: role('花蝴蝶', 'good', butterflyPrompts.butterfly, 'god'),
    dreamer: role('摄梦人', 'good', dreamerPrompts.dreamer, 'god'),
    magician: role('魔术师', 'good', magicianPrompts.magician, 'god'),
    fortune_teller: role('占卜师', 'good', fortuneTellerPrompts.fortuneTeller, 'god'),
    crow: role('乌鸦', 'good', crowPrompts.crow, 'god'),
    bear_tamer: role('驯熊师', 'good', bearTamerPrompts.bearTamer, 'god'),
    bombman: role('炸弹人', 'good', bombmanPrompts.bombman, 'god'),
    nine_tailed_fox: role('九尾狐', 'good', nineTailedFoxPrompts.nineTailedFox, 'god'),
    black_merchant: role('黑商', 'good', blackMerchantPrompts.blackMerchant, 'god'),
    hybrid: role('混血儿', 'good', hybridPrompts.hybrid, 'villager'),
    old_rogue: role('老流氓', 'good', oldRoguePrompts.oldRogue, 'villager', { charmImmune: true, delayedDeath: true }),
    wild_child: role('野孩子', 'good', wildChildPrompts.wildChild, 'third'),
    big_tree: role('大树', 'good', bigTreePrompts.bigTree, 'villager'),
    villager: role('村民', 'good', prompts.villager, 'villager'),
  };
}

let catalog: Readonly<Record<string, RoleEntry>> | null = null;

/**
 * 惰性构建：特殊角色模块会间接引用本模块（规则 → 角色类别），
 * 延迟到首次使用时再读取各模块的身份模板，模块加载顺序就不会影响结果。
 * 只从各角色模块直接引用模板，不要引用 special/index（它在加载时就会展开各模块的阶段）。
 */
export function roleCatalog(): Readonly<Record<string, RoleEntry>> {
  catalog ??= buildCatalog();
  return catalog;
}

export function roleSpecs(): Record<string, RoleSpec> {
  return Object.fromEntries(Object.entries(roleCatalog()).map(([key, entry]) => [key, entry.spec]));
}
