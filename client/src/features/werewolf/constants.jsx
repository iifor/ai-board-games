import React from 'react';
import { Crown, Eye, FlaskConical, Moon, Shield, Sparkles, Sun, Swords, Users, Vote, Wand2 } from 'lucide-react';

export const EMPTY_WEREWOLF = {
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

export const ROLE_NAMES = {
  werewolf: '狼人',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
  idiot: '白痴',
  guard: '守卫',
  villager: '村民'
};

export const ROLE_ICON = {
  werewolf: <Swords size={18} />,
  seer: <Eye size={18} />,
  witch: <FlaskConical size={18} />,
  hunter: <Vote size={18} />,
  idiot: <Sparkles size={18} />,
  guard: <Shield size={18} />,
  villager: <Users size={18} />
};

export const EVENT_LABELS = {
  players: '玩家入场',
  'phase-start': '阶段开始',
  'night-result': '夜间结算',
  'day-start': '天亮播报',
  'sheriff-result': '警长竞选',
  speech: '白天发言',
  'vote-result': '放逐投票',
  'last-words': '夜晚遗言',
  'exile-words': '放逐遗言',
  'hunter-shot': '猎人开枪',
  game: '胜负结算',
  host: '主持播报'
};
