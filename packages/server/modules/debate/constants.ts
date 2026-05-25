import { DEBATE } from '@consensus-mist/shared/constants/gameLimits';

const PHASE_LIMITS = DEBATE.PHASE_LIMITS;

interface DebatePhase {
  readonly id: string;
  readonly name: string;
  readonly limit: number;
}

interface DebateTopic {
  readonly title: string;
  readonly proPosition: string;
  readonly conPosition: string;
}

const PHASES: DebatePhase[] = [
  { id: 'strategy', name: '队长战术部署', limit: PHASE_LIMITS.strategy },
  { id: 'opening', name: '立论陈词', limit: PHASE_LIMITS.opening },
  { id: 'crossfire', name: '正反攻辩', limit: PHASE_LIMITS.crossfire },
  { id: 'free', name: '自由辩论', limit: PHASE_LIMITS.free },
  { id: 'closing', name: '总结陈词', limit: PHASE_LIMITS.closing },
  { id: 'judges', name: '评委点评', limit: PHASE_LIMITS.judges },
  { id: 'mvp', name: '评选最佳辩手', limit: PHASE_LIMITS.mvp },
  { id: 'postgame', name: '赛后发言', limit: PHASE_LIMITS.postgame },
];

const TOPICS: DebateTopic[] = [
  {
    title: 'AI 应该拥有参与重大公共决策的投票权吗？',
    proPosition: 'AI 应该在限定范围内拥有公共决策投票权',
    conPosition: 'AI 不应该拥有公共决策投票权',
  },
];

export { DEBATE, PHASE_LIMITS, PHASES, TOPICS };
export type { DebatePhase, DebateTopic };
