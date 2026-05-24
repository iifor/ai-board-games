const { AgentSkillRegistry } = require('./skillRegistry');

class RoleSkillRegistry {
  constructor() {
    this.roles = new Map();
  }

  register(roleId, skill) {
    if (!roleId) throw new Error('RoleSkill 缺少 roleId');
    if (!this.roles.has(roleId)) this.roles.set(roleId, new AgentSkillRegistry());
    this.roles.get(roleId).register({ ...skill, scope: 'role', roleId });
    return this;
  }

  registerMany(roleId, skills = []) {
    skills.forEach((skill) => this.register(roleId, skill));
    return this;
  }

  get(roleId, action) {
    return this.roles.get(roleId)?.get(action) || null;
  }

  has(roleId, action) {
    return Boolean(this.get(roleId, action));
  }

  list(roleId = null) {
    if (roleId) return this.roles.get(roleId)?.list() || [];
    return Array.from(this.roles.entries()).flatMap(([id, registry]) =>
      registry.list().map((skill) => ({ ...skill, roleId: skill.roleId || id }))
    );
  }

  applyToPlayer(playerAgent, roleId) {
    if (!playerAgent?.registerSkills) return playerAgent;
    playerAgent.registerSkills(this.list(roleId).map((skill) => ({ ...skill, scope: 'player', roleId })));
    return playerAgent;
  }
}

module.exports = { RoleSkillRegistry };
