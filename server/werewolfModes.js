const { getWerewolfMode, listWerewolfModes, listWerewolfRoles } = require('./adminStore');

const FALLBACK_ROLE = {
  id: 'villager',
  name: '村民',
  faction: 'good',
  roleType: 'villager',
  responsibility: '依靠发言、票型和死亡信息找出狼人。',
  ability: '白天发言和投票。',
  keyInfo: '没有夜晚技能。',
  rule: { actions: [{ trigger: 'day', action: 'speakOnly' }, { trigger: 'vote', action: 'voteOnly' }] }
};

function getWerewolfModeConfig(mode) {
  const requested = typeof mode === 'string' ? { id: mode } : (mode || {});
  const modeId = requested.id || requested.modeId;
  const modeRow = modeId ? getWerewolfMode(modeId) : listWerewolfModes().find((item) => item.enabled);
  if (!modeRow || !modeRow.enabled) throw new Error('狼人杀模式不存在或未启用，请先在 B 端配置启用模式。');

  const roleMap = new Map(listWerewolfRoles().map((role) => [role.id, role]));
  const roleSlots = [];
  for (const item of modeRow.roles || []) {
    const role = roleMap.get(item.roleId);
    if (!role || !role.enabled) throw new Error(`狼人杀模式引用了不可用角色：${item.roleId}`);
    for (let index = 0; index < Number(item.count || 0); index += 1) roleSlots.push(role.id);
  }
  if (!roleSlots.length) throw new Error('狼人杀模式未配置角色阵容。');

  const runtimeRoles = Object.fromEntries(
    [...roleMap.values()].map((role) => [role.id, normalizeRole(role)])
  );
  if (!runtimeRoles.villager) runtimeRoles.villager = FALLBACK_ROLE;

  return {
    id: modeRow.id,
    name: modeRow.name,
    version: modeRow.version || 'v1.0',
    background: modeRow.description || buildModeBackground(modeRow, runtimeRoles),
    description: modeRow.description || '',
    roles: roleSlots,
    roleMap: runtimeRoles,
    sheriff: {
      enabled: Boolean(modeRow.sheriff?.enabled),
      firstDayElection: modeRow.sheriff?.firstDayElection !== false,
      voteWeight: Number(modeRow.sheriff?.voteWeight || 1.5)
    },
    winCondition: modeRow.winCondition || 'side',
    lastWordsLimit: Number(modeRow.rules?.lastWordsLimit ?? 3),
    witch: {
      canSelfSaveNightOne: true,
      onePotionPerNight: true,
      hideWolfTargetAfterAntidoteUsed: true
    },
    hunter: {
      disabledDeathReasons: getDisabledDeathReasons(runtimeRoles)
    },
    idiot: {
      surviveExileOnce: hasAction(runtimeRoles.idiot, 'surviveExileOnce'),
      losesVoteAfterReveal: true
    }
  };
}

function normalizeRole(role) {
  return {
    id: role.id,
    name: role.name,
    faction: role.faction === 'wolves' ? 'wolves' : 'good',
    roleType: role.roleType || 'villager',
    responsibility: role.responsibility || '',
    ability: role.ability || '',
    keyInfo: role.keyInfo || '',
    rule: role.rule || {}
  };
}

function hasAction(role, action) {
  return Array.isArray(role?.rule?.actions) && role.rule.actions.some((item) => item.action === action);
}

function getDisabledDeathReasons(roleMap) {
  const hunterAction = roleMap.hunter?.rule?.actions?.find((item) => item.action === 'shootOnDeath');
  return Array.isArray(hunterAction?.disabledDeathReasons) ? hunterAction.disabledDeathReasons : ['女巫毒药'];
}

function buildModeBackground(mode, roleMap) {
  const roles = (mode.roles || [])
    .map((item) => `${item.count}${roleMap[item.roleId]?.name || item.roleId}`)
    .join('、');
  return `${mode.name}：${roles}`;
}

module.exports = {
  getWerewolfModeConfig
};
