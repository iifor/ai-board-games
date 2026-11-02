import type { PromptTemplate, RoleSpec } from '@battle/engine';
import { werewolfPrompts } from './prompts';
import { ROLE_CATALOG } from './roles';
import { specialIdentities } from './special';

// 把角色目录（roles.ts）与身份模板装配成引擎的 RoleSpec：基础角色的身份模板在 prompts.ts，特殊角色的由登记表给出。

/** 基础角色的身份模板 */
const BASE_IDENTITIES: Readonly<Record<string, PromptTemplate>> = {
  werewolf: werewolfPrompts.werewolf,
  seer: werewolfPrompts.seer,
  witch: werewolfPrompts.witch,
  hunter: werewolfPrompts.hunter,
  idiot: werewolfPrompts.idiot,
  villager: werewolfPrompts.villager,
  rabbit: werewolfPrompts.rabbit,
};

/** 每个角色目录中的角色都必须有且只有一处身份模板；身份模板也必须对应目录中的角色 */
export function roleSpecs(): Record<string, RoleSpec> {
  const duplicated = Object.keys(specialIdentities).filter((key) => Object.hasOwn(BASE_IDENTITIES, key));
  if (duplicated.length) throw new Error(`身份模板重复登记：${duplicated.join('、')}`);
  const identities = { ...BASE_IDENTITIES, ...specialIdentities };
  const unknown = Object.keys(identities).filter((key) => !Object.hasOwn(ROLE_CATALOG, key));
  if (unknown.length) throw new Error(`身份模板对应的角色没有在角色目录中登记：${unknown.join('、')}`);
  return Object.fromEntries(Object.entries(ROLE_CATALOG).map(([key, entry]) => {
    const identity = identities[key];
    if (identity === undefined) throw new Error(`角色 ${key} 没有登记身份模板`);
    const spec: RoleSpec = { name: entry.name, team: entry.team, identity, ...(entry.team === 'werewolf' ? { knowsTeammates: true } : {}) };
    return [key, spec];
  }));
}
