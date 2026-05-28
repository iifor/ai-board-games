import { Eye, FlaskConical, Shield, Sparkles, Swords, Users, Vote } from 'lucide-react';
import type { GameState } from '../../types';
import type { NightBadgeTheme } from '../../types';

export const EMPTY_WEREWOLF: GameState = {
  id: 'pending-werewolf',
  type: 'werewolf',
  mode: 'real',
  event: {
    name: 'AI 狼人杀',
    background: '12 人标准局：狼人阵营与神职、平民阵营在昼夜轮转中对抗。'
  },
  players: [],
  rounds: [],
  winner: null,
  winReason: ''
};

export const ROLE_NAMES: Record<string, string> = {
  werewolf: '狼人',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
  idiot: '白痴',
  guard: '守卫',
  villager: '村民'
};

export const ROLE_ICON: Record<string, React.ReactElement> = {
  werewolf: <Swords size={18} />,
  seer: <Eye size={18} />,
  witch: <FlaskConical size={18} />,
  hunter: <Vote size={18} />,
  idiot: <Sparkles size={18} />,
  guard: <Shield size={18} />,
  villager: <Users size={18} />
};

export const EVENT_LABELS: Record<string, string> = {
  players: '玩家入场',
  'phase-start': '阶段开始',
  'wolf-wake': '狼人睁眼',
  'wolf-leader': '狼队领袖',
  'wolf-speech': '狼队夜聊',
  'seer-wake': '预言家查验',
  'seer-check': '预言家查验结果',
  'guard-wake': '守卫守护',
  'witch-antidote': '女巫解药',
  'witch-poison': '女巫毒药',
  'night-result': '夜间结算',
  'day-start': '天亮播报',
  'sheriff-start': '上警开始',
  'sheriff-speech': '警上发言',
  'sheriff-vote': '警长投票',
  'sheriff-runoff-speech': '警长复发言',
  'sheriff-runoff-vote': '警长复投',
  'sheriff-result': '警长竞选',
  'speech-order': '发言顺序',
  'sheriff-badge-transfer': '警徽移交',
  'sheriff-badge-tear': '撕警徽',
  speech: '白天发言',
  'day-vote': '玩家投票',
  'vote-result': '放逐投票',
  'last-words': '夜晚遗言',
  'exile-words': '放逐遗言',
  'hunter-shot': '猎人开枪',
  'self-destruct': '狼人自爆',
  game: '胜负结算',
  host: '主持播报'
};

export const WEREWOLF_NIGHT_BADGE_THEME: Record<string, NightBadgeTheme> = {
  default: {
    className: 'default',
    style: {
      '--werewolf-night-badge-accent': '#fff1a1',
      '--werewolf-night-badge-result': '#d8efff'
    }
  },
  safe: {
    className: 'safe',
    style: {
      '--werewolf-night-badge-accent': '#b9ffd0',
      '--werewolf-night-badge-result': '#7ff0a7'
    }
  },
  danger: {
    className: 'danger',
    style: {
      '--werewolf-night-badge-accent': '#ffd0d0',
      '--werewolf-night-badge-result': '#ff7777'
    }
  },
  muted: {
    className: 'muted',
    style: {
      '--werewolf-night-badge-accent': '#dde5f5',
      '--werewolf-night-badge-result': '#dde5f5'
    }
  }
};
