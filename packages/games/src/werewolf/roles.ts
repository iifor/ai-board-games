import type { PromptTemplate, RoleSpec } from '@battle/engine';
import type { RoleCategory } from './boards';
import { werewolfPrompts as prompts } from './prompts';
import { guardPrompts } from './special/guard';
import { whiteWolfKingPrompts } from './special/whiteWolfKing';

export interface RoleEntry {
  readonly spec: RoleSpec;
  /** 屠边判定用的类别；板子可在 config.categories 中覆盖 */
  readonly category: RoleCategory;
}

function role(name: string, team: 'werewolf' | 'good', identity: PromptTemplate, category: RoleCategory): RoleEntry {
  return { spec: { name, team, identity, ...(team === 'werewolf' ? { knowsTeammates: true } : {}) }, category };
}

/** 全部板子用到的角色；新增特殊角色时在此登记 */
export const ROLE_CATALOG: Readonly<Record<string, RoleEntry>> = {
  werewolf: role('狼人', 'werewolf', prompts.werewolf, 'wolf'),
  white_wolf_king: role('白狼王', 'werewolf', whiteWolfKingPrompts.whiteWolfKing, 'wolf'),
  seer: role('预言家', 'good', prompts.seer, 'god'),
  witch: role('女巫', 'good', prompts.witch, 'god'),
  hunter: role('猎人', 'good', prompts.hunter, 'god'),
  idiot: role('白痴', 'good', prompts.idiot, 'god'),
  guard: role('守卫', 'good', guardPrompts.guard, 'god'),
  villager: role('村民', 'good', prompts.villager, 'villager'),
};

export function roleSpecs(): Record<string, RoleSpec> {
  return Object.fromEntries(Object.entries(ROLE_CATALOG).map(([key, entry]) => [key, entry.spec]));
}
