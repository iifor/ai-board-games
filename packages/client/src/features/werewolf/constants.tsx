import React from 'react';
import { Eye, FlaskConical, Moon, Shield, Sparkles, Swords, Users, Vote, WandSparkles } from 'lucide-react';
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
  wild_child: '野孩子',
  bombman: '炸弹人',
  nine_tailed_fox: '九尾狐',
  evil_knight: '恶灵骑士',
  old_rogue: '老流氓',
  white_wolf_king: '白狼王',
  wolf_king: '狼王',
  dreamer: '摄梦人',
  magician: '魔术师',
  hybrid: '混血儿',
  silence_elder: '禁言长老',
  knight: '骑士',
  stalker: '潜行者',
  butterfly: '花蝴蝶',
  wolf_beauty: '狼美人',
  demon: '恶灵骑士',
  nightmare: '噩梦之影',
  big_bad_wolf: '大灰狼',
  fortune_teller: '占卜师',
  hidden_wolf: '隐狼',
  black_merchant: '黑商',
  big_tree: '大树',
  sapling: '树苗',
  magic_wolf: '魔狼',
  demon_hunter: '猎魔人',
  spirit_wolf: '灵狼',
  wolf_witch: '狼巫',
  illusionist: '幻术师',
  wolf_elder_brother: '狼兄',
  wolf_younger_brother: '狼弟',
  crow: '乌鸦',
  penguin: '企鹅',
  fox: '狐狸',
  bear_tamer: '驯熊师',
  rabbit: '兔子',
  escape_hunter: '猎人',
  tamed_werewolf: '驯化狼',
  thick_wolf: '厚皮狼',
  werewolf: '狼人',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
  idiot: '白痴',
  guard: '守卫',
  villager: '村民'
};

export const ROLE_ICON: Record<string, React.ReactElement> = {
  wild_child: <Users size={18} />,
  bombman: <Sparkles size={18} />,
  nine_tailed_fox: <Moon size={18} />,
  evil_knight: <Shield size={18} />,
  old_rogue: <Users size={18} />,
  white_wolf_king: <Swords size={18} />,
  wolf_king: <Swords size={18} />,
  dreamer: <Moon size={18} />,
  magician: <WandSparkles size={18} />,
  hybrid: <Users size={18} />,
  silence_elder: <Sparkles size={18} />,
  knight: <Shield size={18} />,
  stalker: <Swords size={18} />,
  butterfly: <Sparkles size={18} />,
  wolf_beauty: <Sparkles size={18} />,
  demon: <Shield size={18} />,
  nightmare: <Moon size={18} />,
  big_bad_wolf: <Swords size={18} />,
  fortune_teller: <Eye size={18} />,
  hidden_wolf: <Moon size={18} />,
  black_merchant: <WandSparkles size={18} />,
  big_tree: <Shield size={18} />,
  sapling: <Users size={18} />,
  magic_wolf: <Swords size={18} />,
  demon_hunter: <Swords size={18} />,
  spirit_wolf: <Swords size={18} />,
  wolf_witch: <Swords size={18} />,
  illusionist: <WandSparkles size={18} />,
  wolf_elder_brother: <Swords size={18} />,
  wolf_younger_brother: <Swords size={18} />,
  crow: <Sparkles size={18} />,
  penguin: <Shield size={18} />,
  fox: <Eye size={18} />,
  bear_tamer: <Shield size={18} />,
  rabbit: <Users size={18} />,
  escape_hunter: <Swords size={18} />,
  tamed_werewolf: <Users size={18} />,
  thick_wolf: <Shield size={18} />,
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
  'escape-hunter-speech': '猎人夜聊',
  'escape-hunter-vote': '猎人共同投票',
  'escape-hunter-hunt': '猎人共同猎杀',
  'thick-wolf-armor': '厚皮狼护甲破裂',
  'seer-wake': '预言家查验',
  'seer-check': '预言家查验结果',
  'guard-wake': '守卫守护',
  'hybrid-master': '混血儿选择',
  'silence-result': '禁言结果',
  'knight-duel': '骑士决斗',
  'butterfly-hug': '花蝴蝶抱人',
  'stalker-assassinate': '潜行者暗杀',
  'wolf-beauty-charm': '狼美人魅惑',
  'demon-inspect': '恶灵骑士查验',
  'nightmare-fear': '噩梦之影恐惧',
  'dreamer-dream': '摄梦人摄梦',
  'magician-swap': '魔术师交换',
  'fortune-teller-mark': '占卜师标记',
  'big-bad-wolf-kill': '大灰狼袭击',
  'crow-curse': '乌鸦诅咒',
  'black-merchant-gift': '黑商赠技',
  'lucky-seer-check': '幸运儿查验',
  'lucky-witch-poison': '幸运儿毒药',
  'younger-brother-kill': '狼弟独刀',
  'spirit-wolf-learn': '灵狼学习',
  'spirit-wolf-inspect': '灵狼查验',
  'spirit-wolf-guard': '灵狼庇护',
  'spirit-wolf-antidote': '灵狼解药',
  'wolf-witch-curse': '狼巫诅咒',
  'illusionist-illusion': '幻术师幻象',
  'penguin-freeze': '企鹅冰冻',
  'fox-inspect': '狐狸验三连',
  'bear-tamer-roar': '驯熊师咆哮',
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
