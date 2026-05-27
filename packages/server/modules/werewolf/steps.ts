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

function createWerewolfSteps(): WorkflowStep[] {
  const steps: WorkflowStep[] = [{ id: 'assign_roles', type: 'werewolf.assign_roles', name: '分配身份', config: {} }];
  for (let day = 1; day <= MAX_DAYS; day += 1) {
    steps.push({ id: `night_start_${day}`, type: 'werewolf.night_start', name: `第${day}夜开始`, config: { day, phase: 'night' } });
    steps.push({ id: `wolf_speech_${day}`, type: 'werewolf.action_window', name: `第${day}夜狼人夜聊`, config: { day, phase: 'night', actionType: 'wolf_speech', ordered: true } });
    steps.push({ id: `wolf_vote_${day}`, type: 'werewolf.action_window', name: `第${day}夜狼人刀口投票`, config: { day, phase: 'night', actionType: 'wolf_vote' } });
    steps.push({ id: `seer_check_${day}`, type: 'werewolf.action_window', name: `第${day}夜预言家查验`, config: { day, phase: 'night', actionType: 'seer_check', optional: true } });
    steps.push({ id: `guard_protect_${day}`, type: 'werewolf.action_window', name: `第${day}夜守卫守护`, config: { day, phase: 'night', actionType: 'guard_protect', optional: true } });
    steps.push({ id: `witch_save_${day}`, type: 'werewolf.action_window', name: `第${day}夜女巫解药`, config: { day, phase: 'night', actionType: 'witch_save', optional: true } });
    steps.push({ id: `witch_poison_${day}`, type: 'werewolf.action_window', name: `第${day}夜女巫毒药`, config: { day, phase: 'night', actionType: 'witch_poison', optional: true } });
    steps.push({ id: `night_resolve_${day}`, type: 'werewolf.night_resolve', name: `第${day}夜结算`, config: { day, phase: 'night' } });
    steps.push({ id: `day_start_${day}`, type: 'werewolf.day_start', name: `第${day}天开始`, config: { day, phase: 'day' } });
    if (day === 1) addSheriffSteps(steps, day);
    steps.push({ id: `day_speech_${day}`, type: 'werewolf.action_window', name: `第${day}天发言`, config: { day, phase: 'day', actionType: 'day_speech' } });
    steps.push({ id: `day_vote_${day}`, type: 'werewolf.action_window', name: `第${day}天投票`, config: { day, phase: 'day', actionType: 'day_vote' } });
    steps.push({ id: `exile_resolve_${day}`, type: 'werewolf.exile_resolve', name: `第${day}天放逐结算`, config: { day, phase: 'day' } });
    steps.push({ id: `check_win_${day}`, type: 'werewolf.check_win', name: `第${day}天胜负检查`, config: { day } });
  }
  steps.push({ id: 'finalize', type: 'werewolf.finalize', name: '结束游戏', config: {} });
  return steps;
}

function addSheriffSteps(steps: WorkflowStep[], day: number): void {
  steps.push({ id: 'sheriff_signup_1', type: 'werewolf.action_window', name: '首日警长竞选报名', config: { day, phase: 'day', actionType: 'sheriff_signup' } });
  steps.push({ id: 'sheriff_speech_1', type: 'werewolf.action_window', name: '首日警上竞选发言', config: { day, phase: 'day', actionType: 'sheriff_speech', ordered: true } });
  steps.push({ id: 'sheriff_withdraw_1', type: 'werewolf.action_window', name: '首日警上退水', config: { day, phase: 'day', actionType: 'sheriff_withdraw' } });
  steps.push({ id: 'sheriff_vote_1', type: 'werewolf.action_window', name: '首日警长竞选投票', config: { day, phase: 'day', actionType: 'sheriff_vote' } });
  steps.push({ id: 'sheriff_runoff_speech_1', type: 'werewolf.action_window', name: '首日警长复投发言', config: { day, phase: 'day', actionType: 'sheriff_runoff_speech', ordered: true, optional: true } });
  steps.push({ id: 'sheriff_runoff_vote_1', type: 'werewolf.action_window', name: '首日警长复投投票', config: { day, phase: 'day', actionType: 'sheriff_runoff_vote', optional: true } });
  steps.push({ id: 'sheriff_resolve_1', type: 'werewolf.sheriff_resolve', name: '首日警长竞选结算', config: { day, phase: 'day', actionType: 'sheriff_resolve' } });
}

export { createWerewolfSteps };
