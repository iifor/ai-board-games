import { MAX_DAYS } from './constants';

interface StepConfig {
  day?: number;
  phase?: string;
  actionType?: string;
  optional?: boolean;
  ordered?: boolean;
}

interface WorkflowStep {
  id: string;
  type: string;
  name: string;
  config: StepConfig;
}

function actionStep(id: string, name: string, day: number, actionType: string, extra: Partial<StepConfig> = {}): WorkflowStep {
  return {
    id: `${id}_${day}`,
    type: 'werewolf.action_window',
    name,
    config: { day, phase: extra.phase || 'night', actionType, ...extra },
  };
}

function createWerewolfSteps(): WorkflowStep[] {
  const steps: WorkflowStep[] = [
    { id: 'assign_roles', type: 'werewolf.assign_roles', name: 'assign_roles', config: {} },
    { id: 'thief_choose_1', type: 'werewolf.action_window', name: 'thief_choose', config: { day: 1, phase: 'night', actionType: 'thief_choose', optional: true } },
    { id: 'cupid_link_1', type: 'werewolf.action_window', name: 'cupid_link', config: { day: 1, phase: 'night', actionType: 'cupid_link', optional: true } },
    { id: 'succubus_link_1', type: 'werewolf.action_window', name: 'succubus_link', config: { day: 1, phase: 'night', actionType: 'succubus_link', optional: true } },
    { id: 'ghost_bride_link_1', type: 'werewolf.action_window', name: 'ghost_bride_link', config: { day: 1, phase: 'night', actionType: 'ghost_bride_link', optional: true } },
    { id: 'hybrid_choose_master_1', type: 'werewolf.action_window', name: 'hybrid_choose_master', config: { day: 1, phase: 'night', actionType: 'hybrid_choose_master', optional: true } },
  ];

  for (let day = 1; day <= MAX_DAYS; day += 1) {
    steps.push({ id: `night_start_${day}`, type: 'werewolf.night_start', name: 'night_start', config: { day, phase: 'night' } });
    steps.push(actionStep('ghost_bride_chat', 'ghost_bride_chat', day, 'ghost_bride_chat', { optional: true, ordered: true }));
    steps.push(actionStep('requester_pray', 'requester_pray', day, 'requester_pray', { optional: true }));
    steps.push(actionStep('fortune_teller_mark', 'fortune_teller_mark', day, 'fortune_teller_mark', { optional: true }));
    steps.push(actionStep('magician_swap', 'magician_swap', day, 'magician_swap', { optional: true }));
    steps.push(actionStep('dreamer_dream', 'dreamer_dream', day, 'dreamer_dream'));
    steps.push(actionStep('nightmare_fear', 'nightmare_fear', day, 'nightmare_fear', { optional: true }));
    steps.push(actionStep('penguin_freeze', 'penguin_freeze', day, 'penguin_freeze', { optional: true }));
    steps.push(actionStep('butterfly_hug', 'butterfly_hug', day, 'butterfly_hug', { optional: true }));
    steps.push(actionStep('stalker_assassinate', 'stalker_assassinate', day, 'stalker_assassinate', { optional: true }));
    steps.push(actionStep('elder_silence', 'elder_silence', day, 'elder_silence', { optional: true }));
    steps.push(actionStep('wolf_witch_curse', 'wolf_witch_curse', day, 'wolf_witch_curse', { optional: true }));
    steps.push(actionStep('illusionist_illusion', 'illusionist_illusion', day, 'illusionist_illusion', { optional: true }));
    steps.push(actionStep('wolf_speech', 'wolf_speech', day, 'wolf_speech', { ordered: true }));
    steps.push(actionStep('wolf_vote', 'wolf_vote', day, 'wolf_vote'));
    steps.push(actionStep('wolf_seed_infect', 'wolf_seed_infect', day, 'wolf_seed_infect', { optional: true }));
    steps.push(actionStep('big_bad_wolf_kill', 'big_bad_wolf_kill', day, 'big_bad_wolf_kill', { optional: true }));
    steps.push(actionStep('wolf_beauty_charm', 'wolf_beauty_charm', day, 'wolf_beauty_charm', { optional: true }));
    steps.push(actionStep('demon_inspect', 'demon_inspect', day, 'demon_inspect', { optional: true }));
    steps.push(actionStep('heavenly_eye_check', 'heavenly_eye_check', day, 'heavenly_eye_check', { optional: true }));
    steps.push(actionStep('fox_inspect', 'fox_inspect', day, 'fox_inspect', { optional: true }));
    steps.push(actionStep('escape_hunter_speech', 'escape_hunter_speech', day, 'escape_hunter_speech', { ordered: true }));
    steps.push(actionStep('escape_hunter_vote', 'escape_hunter_vote', day, 'escape_hunter_vote'));
    steps.push(actionStep('seer_check', 'seer_check', day, 'seer_check', { optional: true }));
    steps.push(actionStep('black_merchant_gift', 'black_merchant_gift', day, 'black_merchant_gift', { optional: true }));
    steps.push(actionStep('lucky_seer_check', 'lucky_seer_check', day, 'lucky_seer_check', { optional: true }));
    steps.push(actionStep('guard_protect', 'guard_protect', day, 'guard_protect', { optional: true }));
    steps.push(actionStep('witch_save', 'witch_save', day, 'witch_save', { optional: true }));
    steps.push(actionStep('witch_poison', 'witch_poison', day, 'witch_poison', { optional: true }));
    steps.push(actionStep('spirit_wolf_learn', 'spirit_wolf_learn', day, 'spirit_wolf_learn', { optional: true }));
    steps.push(actionStep('spirit_wolf_inspect', 'spirit_wolf_inspect', day, 'spirit_wolf_inspect', { optional: true }));
    steps.push(actionStep('spirit_wolf_guard', 'spirit_wolf_guard', day, 'spirit_wolf_guard', { optional: true }));
    steps.push(actionStep('spirit_wolf_antidote', 'spirit_wolf_antidote', day, 'spirit_wolf_antidote', { optional: true }));
    steps.push(actionStep('lucky_witch_poison', 'lucky_witch_poison', day, 'lucky_witch_poison', { optional: true }));
    steps.push(actionStep('demon_hunter_hunt', 'demon_hunter_hunt', day, 'demon_hunter_hunt', { optional: true }));
    steps.push(actionStep('younger_brother_kill', 'younger_brother_kill', day, 'younger_brother_kill', { optional: true }));
    steps.push(actionStep('requester_kill', 'requester_kill', day, 'requester_kill', { optional: true }));
    steps.push(actionStep('ghost_bride_kill', 'ghost_bride_kill', day, 'ghost_bride_kill', { optional: true }));
    steps.push(actionStep('crow_curse', 'crow_curse', day, 'crow_curse', { optional: true }));
    steps.push({ id: `day_start_${day}`, type: 'werewolf.day_start', name: 'day_start', config: { day, phase: 'day' } });
    if (day === 1) addSheriffSteps(steps, day);
    steps.push({ id: `night_resolve_${day}`, type: 'werewolf.night_resolve', name: 'night_resolve', config: { day, phase: 'day' } });
    steps.push(actionStep('bear_tamer_roar', 'bear_tamer_roar', day, 'bear_tamer_roar', { phase: 'day', optional: true }));
    steps.push(actionStep('sheriff_speech_direction', 'sheriff_speech_direction', day, 'sheriff_speech_direction', { phase: 'day' }));
    steps.push(actionStep('day_speech', 'day_speech', day, 'day_speech', { phase: 'day', ordered: true }));
    steps.push(actionStep('knight_duel', 'knight_duel', day, 'knight_duel', { phase: 'day', optional: true }));
    steps.push(actionStep('day_vote', 'day_vote', day, 'day_vote', { phase: 'day', ordered: true }));
    steps.push({ id: `exile_resolve_${day}`, type: 'werewolf.exile_resolve', name: 'exile_resolve', config: { day, phase: 'day' } });
    steps.push({ id: `check_win_${day}`, type: 'werewolf.check_win', name: 'check_win', config: { day } });
  }

  steps.push({ id: 'force_result', type: 'werewolf.finalize', name: 'force_result', config: {} });
  steps.push({ id: 'postgame_reset', type: 'werewolf.postgame_reset', name: 'postgame_reset', config: { phase: 'day' } });
  steps.push({ id: 'postgame_daybreak', type: 'werewolf.postgame_daybreak', name: 'postgame_daybreak', config: { phase: 'day' } });
  steps.push({ id: 'postgame_mvp_intro', type: 'werewolf.postgame_mvp_intro', name: 'postgame_mvp_intro', config: { phase: 'postgame' } });
  steps.push({ id: 'postgame_mvp_vote', type: 'werewolf.action_window', name: 'postgame_mvp_vote', config: { phase: 'postgame', actionType: 'mvp_vote', ordered: true } });
  steps.push({ id: 'postgame_mvp_result', type: 'werewolf.mvp_result', name: 'postgame_mvp_result', config: { phase: 'postgame' } });
  steps.push({ id: 'postgame_speech', type: 'werewolf.action_window', name: 'postgame_speech', config: { phase: 'postgame', actionType: 'postgame_speech', ordered: true } });
  steps.push({ id: 'finalize', type: 'werewolf.complete', name: 'finalize', config: { phase: 'postgame' } });
  return insertSelfDestructResolveSteps(steps);
}

function insertSelfDestructResolveSteps(steps: WorkflowStep[]): WorkflowStep[] {
  return steps.flatMap((step) => {
    if (step.config.actionType !== 'day_speech' || !step.config.day) return [step];
    const day = step.config.day;
    return [
      step,
      { id: `self_destruct_resolve_${day}`, type: 'werewolf.self_destruct_resolve', name: 'self_destruct_resolve', config: { day, phase: 'day' } },
    ];
  });
}

function addSheriffSteps(steps: WorkflowStep[], day: number): void {
  steps.push(actionStep('sheriff_signup', 'sheriff_signup', day, 'sheriff_signup', { phase: 'day' }));
  steps.push(actionStep('sheriff_speech', 'sheriff_speech', day, 'sheriff_speech', { phase: 'day', ordered: true }));
  steps.push(actionStep('sheriff_withdraw', 'sheriff_withdraw', day, 'sheriff_withdraw', { phase: 'day' }));
  steps.push(actionStep('sheriff_vote', 'sheriff_vote', day, 'sheriff_vote', { phase: 'day' }));
  steps.push(actionStep('sheriff_runoff_speech', 'sheriff_runoff_speech', day, 'sheriff_runoff_speech', { phase: 'day', ordered: true, optional: true }));
  steps.push(actionStep('sheriff_runoff_vote', 'sheriff_runoff_vote', day, 'sheriff_runoff_vote', { phase: 'day', optional: true }));
  steps.push({ id: 'sheriff_resolve_1', type: 'werewolf.sheriff_resolve', name: 'sheriff_resolve', config: { day, phase: 'day', actionType: 'sheriff_resolve' } });
}

export { createWerewolfSteps };
