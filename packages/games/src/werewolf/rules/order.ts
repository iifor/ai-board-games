/**
 * 夜晚与白天的阶段顺序。特殊角色的阶段插入这里，本局没有该角色时由 enabled() 静默跳过。
 * 阶段的 next 用 nightAfter / dayAfter 取，避免各模块手写相互引用。
 */
export const NIGHT_ORDER = [
  'night_start',
  'night_reset',
  'merchant_deal_early',
  'bear_watch',
  'fortune_mark',
  'fortune_notice',
  'magician_swap',
  'dreamer_dream',
  'hybrid_choose',
  'wild_child_choose',
  'nightmare_fear',
  'penguin_freeze',
  'butterfly_hug',
  'night_blocks',
  'stalker_assassinate',
  'elder_silence',
  'guard_protect',
  'younger_brother_join',
  'wolf_chat',
  'wolf_kill',
  'wolf_seed_infect',
  'hidden_wolf_kill',
  'younger_brother_kill',
  'big_bad_wolf_decide',
  'big_bad_wolf_notice',
  'big_bad_wolf_kill',
  'wolf_beauty_charm',
  'demon_check',
  'seer_check',
  'fox_inspect',
  'witch_save',
  'witch_poison',
  'merchant_doom_notice',
  'merchant_deal',
  'gift_check',
  'gift_poison',
  'crow_curse',
  'fox_check',
  'night_resolve',
] as const;

export const DAY_ORDER = [
  'dawn',
  'speech_direction',
  'day_speech',
  'old_rogue_doom',
  'knight_duel',
  'crow_announce',
  'exile_vote',
  'stalker_mark',
  'exile_resolve',
] as const;

function after(order: readonly string[], id: string, last: string): string {
  const index = order.indexOf(id);
  if (index < 0) throw new Error(`阶段 ${id} 不在顺序表中`);
  return order[index + 1] ?? last;
}

/** 夜晚最后一个阶段之后由 night_resolve 自行决定去向，这里不会被用到 */
export function nightAfter(id: (typeof NIGHT_ORDER)[number]): string {
  return after(NIGHT_ORDER, id, 'dawn');
}

export function dayAfter(id: (typeof DAY_ORDER)[number]): string {
  return after(DAY_ORDER, id, 'night_start');
}
