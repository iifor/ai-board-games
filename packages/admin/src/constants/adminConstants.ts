import type { SelectOption } from '../types/api';
import type { Player, Skin, VoicePackage } from '../types/entities';

export const GAME_LABELS: Record<string, string> = { debate: '辩论赛', werewolf: '狼人杀', consensus: '共识迷雾' };
export const DEBATE_ROLE_LABELS: string[] = ['一辩', '二辩', '三辩', '四辩'];

export const TITLES: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/debate/history': '辩论赛 / 对局历史',
  '/werewolf/history': '狼人杀 / 对局历史',
  '/werewolf/roles': '狼人杀 / 角色管理',
  '/werewolf/modes': '狼人杀 / 模式选择',
  '/consensus/history': '共识迷雾 / 对局历史',
  '/consensus/skins': '共识迷雾 / 皮肤管理',
  '/players': '玩家管理',
  '/models': '模型管理',
  '/models/providers': '模型管理 / 供应商列表',
  '/models/providers/:id': '模型管理 / 供应商模型',
  '/voices': '语音管理',
  '/traces': 'AI 对局观测',
  '/traces/:id': 'AI 对局观测 / Trace 详情',
  '/traces/:id/player/:playerId': 'AI 对局观测 / 玩家分析'
};

export const API_FORMAT_OPTIONS: SelectOption[] = [
  { value: 'openai-compatible', label: 'OpenAI 兼容' },
  { value: 'anthropic-compatible', label: 'Anthropic 兼容' }
];

export const emptyPlayer: Partial<Player> = {
  nickname: '',
  avatar: '',
  sex: '未知',
  personality: '',
  modelId: null,
  voicePackageId: null,
  enabled: true
};

export const emptySkin: Partial<Skin> = {
  name: '',
  version: 'v3.2',
  source: 'admin',
  terms: {},
  background: '',
  truth: '',
  clues: [],
  noises: [],
  memoryExamples: [],
  enabled: true
};

export const emptyVoice: Partial<VoicePackage> = {
  name: '',
  provider: 'browser',
  voiceId: '',
  language: 'zh-CN',
  gender: '',
  style: '',
  rate: '0%',
  pitch: '0%',
  temperature: 0.85,
  sampleText: '你好，我是本局玩家的试听声音。',
  description: '',
  enabled: true
};

export const WEREWOLF_FACTION_OPTIONS: SelectOption[] = [
  { value: 'good', label: '好人阵营' },
  { value: 'wolves', label: '狼人阵营' }
];

export const WEREWOLF_ROLE_TYPE_OPTIONS: SelectOption[] = [
  { value: 'wolf', label: '狼人' },
  { value: 'god', label: '神职' },
  { value: 'villager', label: '平民' }
];

export const WEREWOLF_WIN_OPTIONS: SelectOption[] = [
  { value: 'side', label: '屠边局' },
  { value: 'gods', label: '屠神局' },
  { value: 'villagers', label: '屠民局' },
  { value: 'all', label: '屠城局' }
];
