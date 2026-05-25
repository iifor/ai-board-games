import { CircleHelp, Landmark, MessageSquareText, Star, Swords, Users } from 'lucide-react';
import type { GameState, DebateTopic, DebateStageStep } from '../../types';

export const EMPTY_DEBATE: GameState = {
  id: 'pending-debate',
  type: 'debate',
  mode: 'real',
  topic: {
    title: 'AI 会让人类更自由，还是更依赖？',
    proPosition: 'AI 会让人类更自由',
    conPosition: 'AI 会让人类更依赖'
  },
  players: [],
  phases: [],
  rounds: [],
  mvp: null,
  winner: null,
  winReason: ''
};

export const DEFAULT_DEBATE_TOPIC: DebateTopic = {
  title: 'AI 会让人类更自由，还是更依赖？',
  proPosition: 'AI 会让人类更自由',
  conPosition: 'AI 会让人类更依赖'
};

export const DEFAULT_DEBATE_STAGE_STEPS: DebateStageStep[] = [
  { ids: ['strategy', 'opening'], label: '立论阶段', Icon: Landmark },
  { ids: ['crossfire'], label: '正反攻辩', Icon: Swords },
  { ids: ['free'], label: '自由辩论', Icon: Users },
  { ids: ['closing'], label: '总结陈词', Icon: MessageSquareText },
  { ids: ['judges'], label: '评委点评', Icon: CircleHelp },
  { ids: ['mvp'], label: '最佳辩手评选', Icon: Star },
  { ids: ['postgame'], label: '赛后发言', Icon: MessageSquareText }
];
