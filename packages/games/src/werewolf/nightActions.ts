import { nightCalls, type NightRole } from './nightCalls';
import { roleName } from './roles';
import { NIGHT_ORDER } from './rules/order';
import { werewolfGame } from './spec';

/** 同一角色的一次叫号可能覆盖多个独立的私密请求。借用技能按当局持有者发请求。 */
const otherActors: Readonly<Record<string, NightRole | 'gift'>> = {
  wolf_chat: 'werewolf', wolf_kill: 'werewolf', witch_poison: 'witch',
  merchant_skill_check: 'black_merchant', merchant_skill_gun: 'black_merchant',
  ghost_bride_witness: 'ghost_bride', ghost_bride_chat: 'ghost_bride', ghost_bride_kill: 'ghost_bride',
  spirit_wolf_check: 'spirit_wolf', spirit_wolf_shield: 'spirit_wolf', big_bad_wolf_kill: 'big_bad_wolf',
  gift_check: 'gift', gift_poison: 'gift',
};

const phases = [...NIGHT_ORDER, 'merchant_skill_check', 'merchant_skill_gun'];

function callKeys(id: string, actor: NightRole | 'gift'): string[] {
  if (actor === 'gift') return [];
  if (id === 'ghost_bride_chat' || id === 'ghost_bride_kill') return ['brideFirst', 'brideLater'];
  if (actor === 'spirit_wolf' && id !== 'spirit_wolf_learn') return ['spiritLater'];
  if (id === 'requester_kill') return ['requesterLater'];
  return ['wake.' + actor];
}

export const nightActionPrompts = phases.flatMap(id => {
  const phase = werewolfGame.spec.phases[id];
  if (!phase || !('prompt' in phase)) return [];
  const actor = nightCalls.get(id) ?? otherActors[id];
  if (!actor) throw new Error(`夜间行动缺少角色：${id}`);
  const role = actor === 'gift' ? '获赠技能的玩家' :
    id === 'ghost_bride_chat' || id === 'ghost_bride_kill' ? '鬼魂新娘阵营' : roleName(actor);
  const title = phase.kind === 'act' ? phase.action : phase.title ?? role;
  return [{ phase: id, role, title, template: phase.prompt.name, callKeys: callKeys(id, actor) }];
});
