const WEREWOLF_MODES = {
  'standard-12': {
    id: 'standard-12',
    name: '标准12人局',
    version: '预女猎白',
    background: '12人标准局（预女猎白）：4狼人、预言家、女巫、猎人、白痴、4平民。',
    roles: [
      'werewolf',
      'werewolf',
      'werewolf',
      'werewolf',
      'seer',
      'witch',
      'hunter',
      'idiot',
      'villager',
      'villager',
      'villager',
      'villager'
    ],
    sheriff: {
      enabled: true,
      voteWeight: 1.5
    },
    lastWordsLimit: 3,
    witch: {
      canSelfSaveNightOne: true,
      onePotionPerNight: true,
      hideWolfTargetAfterAntidoteUsed: true
    },
    hunter: {
      disabledDeathReasons: ['女巫毒药']
    },
    idiot: {
      surviveExileOnce: true,
      losesVoteAfterReveal: true
    }
  },
  'mirror-mist': {
    id: 'mirror-mist',
    name: '镜隐迷踪',
    version: '扩展模式',
    background: '镜隐迷踪局：保留标准12人底层规则，额外强调身份误导、镜像叙事和迷踪式发言博弈。'
  },
  'white-wolf-king-knight': {
    id: 'white-wolf-king-knight',
    name: '白狼王騎士',
    version: '扩展模式',
    background: '白狼王騎士局：以标准12人局为基础，主持记录白狼王与骑士主题的强对抗节奏。'
  },
  'wolf-beauty-knight': {
    id: 'wolf-beauty-knight',
    name: '狼美人騎士',
    version: '扩展模式',
    background: '狼美人騎士局：以标准12人局为基础，突出狼美人连接威胁与骑士决斗压力。'
  },
  'gargoyle-gravekeeper': {
    id: 'gargoyle-gravekeeper',
    name: '石像鬼守墓人',
    version: '扩展模式',
    background: '石像鬼守墓人局：以标准12人局为基础，突出夜间查验和放逐信息追踪。'
  },
  'thief-cupid': {
    id: 'thief-cupid',
    name: '盗贼丘比特',
    version: '扩展模式',
    background: '盗贼丘比特局：以标准12人局为基础，突出换牌、情侣线与阵营判断扰动。'
  }
};

function getWerewolfModeConfig(mode) {
  const requested = typeof mode === 'string' ? { id: mode } : (mode || {});
  const base = WEREWOLF_MODES[requested.id] || WEREWOLF_MODES['standard-12'];
  const standard = WEREWOLF_MODES['standard-12'];
  return {
    ...standard,
    ...base,
    name: requested.name || base.name,
    background: requested.description || base.background,
    roles: base.roles || standard.roles,
    sheriff: { ...standard.sheriff, ...(base.sheriff || {}) },
    witch: { ...standard.witch, ...(base.witch || {}) },
    hunter: { ...standard.hunter, ...(base.hunter || {}) },
    idiot: { ...standard.idiot, ...(base.idiot || {}) }
  };
}

module.exports = {
  WEREWOLF_MODES,
  getWerewolfModeConfig
};
