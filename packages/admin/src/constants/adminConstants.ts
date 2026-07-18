import type { SelectOption } from '../types/api';
import type { Player, Skin, VoicePackage } from '../types/entities';

export const GAME_LABELS: Record<string, string> = { debate: '辩论赛', werewolf: '狼人杀', undercover: '谁是卧底' };
export const DEBATE_ROLE_LABELS: string[] = ['一辩', '二辩', '三辩', '四辩'];

export const TITLES: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/debate/history': '辩论赛 / 对局历史',
  '/werewolf/history': '狼人杀 / 对局历史',
  '/werewolf/roles': '狼人杀 / 角色管理',
  '/werewolf/modes': '狼人杀 / 模式选择',
  '/system/public-settings': '系统设置 / 公共设置',
  '/system/players': '系统设置 / 玩家管理',
  '/system/voices': '系统设置 / 语音管理',
  '/system/models': '系统设置 / 模型管理',
  '/system/models/providers': '系统设置 / 模型管理',
  '/system/models/providers/:id': '系统设置 / 供应商模型',
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
  fallbackModelId: null,
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
