import type { PromptTemplate, RoleSpec } from '@battle/engine';
import type { RoleCategory } from './boards';
import { werewolfPrompts as prompts } from './prompts';
import { butterflyPrompts } from './special/butterfly';
import { demonPrompts } from './special/demon';
import { evilKnightPrompts } from './special/evilKnight';
import { guardPrompts } from './special/guard';
import { hybridPrompts } from './special/hybrid';
import { knightPrompts } from './special/knight';
import { nightmarePrompts } from './special/nightmare';
import { silenceElderPrompts } from './special/silenceElder';
import { stalkerPrompts } from './special/stalker';
import { whiteWolfKingPrompts } from './special/whiteWolfKing';
import { wolfBeautyPrompts } from './special/wolfBeauty';

/** 角色的静态特性，规则通过 roleTraits(seat) 读取 */
export interface RoleTraits {
  /** 不能在白天发言中自爆 */
  readonly noSelfDestruct?: boolean;
  /** 免疫女巫的毒药（毒药照常消耗） */
  readonly poisonImmune?: boolean;
  /** 免疫夜间出局的猎人开的枪 */
  readonly nightShotImmune?: boolean;
}

export interface RoleEntry {
  readonly spec: RoleSpec;
  /** 屠边判定用的类别；板子可在 config.categories 中覆盖 */
  readonly category: RoleCategory;
  readonly traits: RoleTraits;
}

function role(name: string, team: 'werewolf' | 'good', identity: PromptTemplate, category: RoleCategory, traits: RoleTraits = {}): RoleEntry {
  return { spec: { name, team, identity, ...(team === 'werewolf' ? { knowsTeammates: true } : {}) }, category, traits };
}

/** 恶魔、恶灵骑士：免疫毒药与夜间出局的猎人的枪，不能自爆 */
const NIGHT_IMMUNE: RoleTraits = { noSelfDestruct: true, poisonImmune: true, nightShotImmune: true };

/** 全部板子用到的角色；新增特殊角色时在此登记 */
function buildCatalog(): Readonly<Record<string, RoleEntry>> {
  return {
    werewolf: role('狼人', 'werewolf', prompts.werewolf, 'wolf'),
    white_wolf_king: role('白狼王', 'werewolf', whiteWolfKingPrompts.whiteWolfKing, 'wolf'),
    wolf_beauty: role('狼美人', 'werewolf', wolfBeautyPrompts.wolfBeauty, 'wolf', { noSelfDestruct: true }),
    demon: role('恶魔', 'werewolf', demonPrompts.demon, 'wolf', NIGHT_IMMUNE),
    evil_knight: role('恶灵骑士', 'werewolf', evilKnightPrompts.evilKnight, 'wolf', NIGHT_IMMUNE),
    nightmare: role('梦魇', 'werewolf', nightmarePrompts.nightmare, 'wolf'),
    seer: role('预言家', 'good', prompts.seer, 'god'),
    witch: role('女巫', 'good', prompts.witch, 'god'),
    hunter: role('猎人', 'good', prompts.hunter, 'god'),
    idiot: role('白痴', 'good', prompts.idiot, 'god'),
    guard: role('守卫', 'good', guardPrompts.guard, 'god'),
    silence_elder: role('禁言长老', 'good', silenceElderPrompts.silenceElder, 'god'),
    knight: role('骑士', 'good', knightPrompts.knight, 'god'),
    stalker: role('潜行者', 'good', stalkerPrompts.stalker, 'god'),
    butterfly: role('花蝴蝶', 'good', butterflyPrompts.butterfly, 'god'),
    hybrid: role('混血儿', 'good', hybridPrompts.hybrid, 'villager'),
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
