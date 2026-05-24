const { RoleSkillRegistry } = require('../agent-core');
const { getRoleConfig, getRoleActions } = require('./utils');

function createWerewolfRoleSkillRegistry(modeConfig, skillRegistry) {
  const roleSkills = new RoleSkillRegistry();
  const slots = Array.isArray(modeConfig?.resolvedRoles) && modeConfig.resolvedRoles.length
    ? modeConfig.resolvedRoles
    : modeConfig?.roles || [];
  for (const slot of slots) {
    const roleId = slot.roleId || slot.id || slot;
    const roleConfig = typeof slot === 'string' ? getRoleConfig(modeConfig, roleId) : { ...getRoleConfig(modeConfig, roleId), ...slot };
    const actions = [...new Set([...getRoleActions(roleConfig), 'speakOnly', 'voteOnly'])];
    roleSkills.registerMany(roleId, actions.map((action) => skillRegistry.get(action)).filter(Boolean));
  }
  return roleSkills;
}

module.exports = { createWerewolfRoleSkillRegistry };
