import type { SpeechState } from '../../types';
import type { AvalonHost, AvalonPublicState } from './types';

const AVALON_VISUAL_QA_GAME: AvalonPublicState = {
  id: 'avalon-visual-qa',
  gameType: 'avalon',
  mode: 'standard-5',
  status: 'team-vote',
  missionNumber: 2,
  proposalAttempt: 1,
  leaderId: 4,
  players: [
    { id: 1, nickname: '豆包', avatar: '/player-posters/doubao.webp' },
    { id: 2, nickname: 'Grok', avatar: '/player-posters/grok.webp' },
    { id: 3, nickname: '文心一言', avatar: '/player-posters/wenxin.webp' },
    { id: 4, nickname: 'Gemini', avatar: '/player-posters/gemini.webp' },
    { id: 5, nickname: 'Kimi', avatar: '/player-posters/kimi.webp' },
  ],
  missions: [
    { number: 1, teamSize: 2, status: 'success', attempt: 1, teamIds: [1, 4], successCount: 2, failCount: 0 },
    { number: 2, teamSize: 3, status: 'team-vote', attempt: 1, leaderId: 4, teamIds: [3, 4, 5], approveCount: 2, rejectCount: 0 },
    { number: 3, teamSize: 2, status: 'pending', attempt: 0, teamIds: [] },
    { number: 4, teamSize: 3, status: 'pending', attempt: 0, teamIds: [] },
    { number: 5, teamSize: 3, status: 'pending', attempt: 0, teamIds: [] },
  ],
  currentTeamIds: [3, 4, 5],
  goodScore: 1,
  evilScore: 0,
};

const AVALON_VISUAL_QA_HOST: AvalonHost = {
  id: 'avalon-host',
  nickname: '主持人',
  avatar: '/player-poster-cutouts/host.webp',
};

const AVALON_VISUAL_QA_SPEECH: SpeechState = {
  id: 'avalon-visual-qa-speech',
  playerId: null,
  speakerLabel: '主持人',
  speakerRole: 'host',
  text: '队长已提交任务队伍，请所有玩家完成表决。',
  wordBoundaries: null,
  currentTimeMs: null,
};

function isAvalonVisualQaEnabled(search: string, isDevelopment: boolean): boolean {
  return isDevelopment && new URLSearchParams(search).get('visualQaAvalon') === '1';
}

export {
  AVALON_VISUAL_QA_GAME,
  AVALON_VISUAL_QA_HOST,
  AVALON_VISUAL_QA_SPEECH,
  isAvalonVisualQaEnabled,
};
