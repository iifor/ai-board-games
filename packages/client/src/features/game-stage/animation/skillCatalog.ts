/** 同一类法术共用动势；按引擎的阶段键区分同名动作及转职、赠送技能。 */
export const EFFECT_PHASES = {
  blade: ['wolf_kill','hidden_wolf_kill','younger_brother_kill','big_bad_wolf_kill','big_bad_wolf_decide','requester_kill','ghost_bride_kill','stalker_assassinate'],
  duel: ['knight_duel','knight_hit','knight_miss','demon_hunter_hunt'],
  shield: ['guard_protect','spirit_wolf_shield','big_tree_fall'],
  heal: ['witch_save','spirit_wolf_antidote'],
  poison: ['witch_poison','gift_poison','old_rogue_doom_cut'],
  inspect: ['seer_check','seer_check_late','demon_check','gift_check','spirit_wolf_check','heavenly_eye_check','fox_inspect','fox_check','bear_watch','fortune_mark','fortune_notice','stalker_mark'],
  shot: ['hunter_shot','hunter_resolve','death_shot','death_shot_resolve','gift_shot','gift_shot_resolve','spirit_wolf_shot','spirit_wolf_shot_resolve'],
  bond: ['hybrid_choose','wild_child_choose','wolf_beauty_charm','cupid_link','succubus_link','ghost_bride_link','ghost_bride_witness','lover_link','lover_veto','wolf_beauty_link','cupid_bond','succubus_bond','ghost_bride_bond'],
  seal: ['elder_silence','nightmare_fear','crow_curse','crow_announce','wolf_witch_curse','wolf_witch_notice','magic_wolf_seal','night_blocks','butterfly_hug'],
  dream: ['dreamer_dream','illusionist_illusion'],
  frost: ['penguin_freeze'],
  trade: ['magician_swap','merchant_deal','merchant_deal_early','merchant_skill_check','merchant_skill_gun','merchant_settle','merchant_doom_notice','thief_choose','thief_take','requester_pray','requester_bless','spirit_wolf_learn'],
  transform: ['wolf_seed_infect','wild_child_convert','younger_brother_join','hidden_wolf_link','wolf_brother_mourn'],
  blast: ['white_wolf_king_blast','bombman_blast','bombman_resolve','white_wolf_king_resolve','self_destruct'],
  badge: ['sheriff_signup','sheriff_withdraw','speech_direction','badge_transfer'],
  reveal: ['exile_resolve','fox_fall','sapling_tree_fall','postgame_reveal'],
} as const;

export type SkillKind = keyof typeof EFFECT_PHASES;
const phases = new Map<string, SkillKind>();
for (const kind of Object.keys(EFFECT_PHASES) as SkillKind[]) {
  for (const phase of EFFECT_PHASES[kind]) phases.set(phase, kind);
}
export const phaseEffect = (phase: string | null) => phases.get(phase ?? '');
export const isSkillKind = (key: unknown): key is SkillKind => typeof key === 'string' && Object.hasOwn(EFFECT_PHASES, key);
