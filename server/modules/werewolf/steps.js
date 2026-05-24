const { MAX_DAYS } = require('./constants');

function createWerewolfSteps() {
  const steps = [{ id: 'assign_roles', type: 'werewolf.assign_roles', name: 'Assign roles', config: {} }];
  for (let day = 1; day <= MAX_DAYS; day += 1) {
    steps.push({ id: `night_start_${day}`, type: 'werewolf.night_start', name: `Night ${day} start`, config: { day, phase: 'night' } });
    steps.push({ id: `wolf_kill_${day}`, type: 'werewolf.action_window', name: `Night ${day} wolf kill`, config: { day, phase: 'night', actionType: 'wolf_kill' } });
    steps.push({ id: `seer_check_${day}`, type: 'werewolf.action_window', name: `Night ${day} seer check`, config: { day, phase: 'night', actionType: 'seer_check', optional: true } });
    steps.push({ id: `guard_protect_${day}`, type: 'werewolf.action_window', name: `Night ${day} guard protect`, config: { day, phase: 'night', actionType: 'guard_protect', optional: true } });
    steps.push({ id: `witch_save_${day}`, type: 'werewolf.action_window', name: `Night ${day} witch save`, config: { day, phase: 'night', actionType: 'witch_save', optional: true } });
    steps.push({ id: `witch_poison_${day}`, type: 'werewolf.action_window', name: `Night ${day} witch poison`, config: { day, phase: 'night', actionType: 'witch_poison', optional: true } });
    steps.push({ id: `night_resolve_${day}`, type: 'werewolf.night_resolve', name: `Night ${day} resolve`, config: { day, phase: 'night' } });
    steps.push({ id: `day_start_${day}`, type: 'werewolf.day_start', name: `Day ${day} start`, config: { day, phase: 'day' } });
    steps.push({ id: `day_speech_${day}`, type: 'werewolf.action_window', name: `Day ${day} speech`, config: { day, phase: 'day', actionType: 'day_speech' } });
    steps.push({ id: `day_vote_${day}`, type: 'werewolf.action_window', name: `Day ${day} vote`, config: { day, phase: 'day', actionType: 'day_vote' } });
    steps.push({ id: `exile_resolve_${day}`, type: 'werewolf.exile_resolve', name: `Day ${day} exile resolve`, config: { day, phase: 'day' } });
    steps.push({ id: `check_win_${day}`, type: 'werewolf.check_win', name: `Day ${day} win check`, config: { day } });
  }
  steps.push({ id: 'finalize', type: 'werewolf.finalize', name: 'Finalize', config: {} });
  return steps;
}

module.exports = { createWerewolfSteps };
