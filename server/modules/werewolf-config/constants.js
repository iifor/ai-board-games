const DEFAULT_WEREWOLF_MODES = [
  {
    id: 'standard-12',
    name: '标准12人局',
    description: '预女猎白，4狼人、预言家、女巫、猎人、白痴、4平民。',
    roles: [
      { roleId: 'werewolf', count: 4 },
      { roleId: 'seer', count: 1 },
      { roleId: 'witch', count: 1 },
      { roleId: 'hunter', count: 1 },
      { roleId: 'idiot', count: 1 },
      { roleId: 'villager', count: 4 }
    ],
    sheriff: { enabled: true, firstDayElection: true, voteWeight: 1.5 },
    winCondition: 'side',
    sortOrder: 1,
    enabled: true
  },
  {
    id: 'guard-12',
    name: '守卫12人局',
    description: '4狼人、预言家、女巫、猎人、守卫、4平民。',
    roles: [
      { roleId: 'werewolf', count: 4 },
      { roleId: 'seer', count: 1 },
      { roleId: 'witch', count: 1 },
      { roleId: 'hunter', count: 1 },
      { roleId: 'guard', count: 1 },
      { roleId: 'villager', count: 4 }
    ],
    sheriff: { enabled: true, firstDayElection: true, voteWeight: 1.5 },
    winCondition: 'side',
    sortOrder: 2,
    enabled: true
  }
];

const DEFAULT_WEREWOLF_ROLES = [
  { id: 'werewolf', name: '狼人', faction: 'wolves', roleType: 'wolf', responsibility: '夜晚参与击杀，白天伪装好人并引导票型。', ability: '夜晚选择击杀目标。', keyInfo: '知道其他狼人同伴。', playStyleAdvice: '夜晚优先统一刀口，白天避免暴露视角，适度站边和制造抗推位。', rule: { actions: [{ trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' }] }, sortOrder: 1 },
  { id: 'seer', name: '预言家', faction: 'good', roleType: 'god', responsibility: '通过查验帮助好人阵营找出狼人。', ability: '每晚查验一名玩家阵营。', keyInfo: '查验结果只对自己可见。', playStyleAdvice: '根据场上压力决定是否跳身份，优先用查验结果建立可信发言链。', rule: { actions: [{ trigger: 'night', action: 'inspectFaction', targetRule: 'alive-not-self' }] }, sortOrder: 2 },
  { id: 'witch', name: '女巫', faction: 'good', roleType: 'god', responsibility: '根据夜晚刀口决定是否使用解药或毒药。', ability: '一瓶解药、一瓶毒药，各只能使用一次。', keyInfo: '首夜可自救；默认一晚只能用一瓶药。', playStyleAdvice: '解药保关键身份，毒药谨慎出手；白天可用药瓶压力观察玩家反应。', rule: { actions: [{ trigger: 'night', action: 'save', limit: 'once' }, { trigger: 'night', action: 'poison', limit: 'once' }] }, sortOrder: 3 },
  { id: 'hunter', name: '猎人', faction: 'good', roleType: 'god', responsibility: '死亡时可带走高度怀疑目标。', ability: '死亡或放逐时开枪带走一名玩家。', keyInfo: '被女巫毒死时不能开枪。', playStyleAdvice: '发言保持强势但不要轻易暴露底牌，开枪目标优先选择逻辑断裂或强冲票位。', rule: { actions: [{ trigger: 'death', action: 'shootOnDeath', disabledDeathReasons: ['女巫毒药'] }] }, sortOrder: 4 },
  { id: 'guard', name: '守卫', faction: 'good', roleType: 'god', responsibility: '夜晚保护关键好人。', ability: '每晚守护一名玩家，不能连续守同一人。', keyInfo: '守护目标被狼人击杀时可避免死亡。', playStyleAdvice: '守护优先考虑预言家、警长或高可信玩家，注意不能连续守同一目标。', rule: { actions: [{ trigger: 'night', action: 'guard', targetRule: 'alive', limit: 'not-same-last-night' }] }, sortOrder: 5 },
  { id: 'idiot', name: '白痴', faction: 'good', roleType: 'god', responsibility: '通过发言和票型帮助好人，被放逐时可翻牌。', ability: '首次被白天放逐时翻牌免死并失去投票权。', keyInfo: '翻牌后仍可发言。', playStyleAdvice: '可承担一定抗推压力，但翻牌前仍要提供清晰站边和票型分析。', rule: { actions: [{ trigger: 'exile', action: 'surviveExileOnce' }] }, sortOrder: 6 },
  { id: 'villager', name: '村民', faction: 'good', roleType: 'villager', responsibility: '依靠发言、票型和死亡信息找出狼人。', ability: '白天发言和投票。', keyInfo: '没有夜晚技能。', playStyleAdvice: '围绕发言逻辑、票型和死亡信息找狼，不要过度认身份，优先保留清晰怀疑链。', rule: { actions: [{ trigger: 'day', action: 'speakOnly' }, { trigger: 'vote', action: 'voteOnly' }] }, sortOrder: 7 }
];

module.exports = { DEFAULT_WEREWOLF_MODES, DEFAULT_WEREWOLF_ROLES };
