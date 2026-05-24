const { AgentSkillRegistry } = require('./skillRegistry');
const { executeSkillWithTrace } = require('./skillExecutor');

class BaseGameAgent {
  constructor({ gameType = '', skillRegistry = null } = {}) {
    this.gameType = gameType;
    this.skillRegistry = skillRegistry || new AgentSkillRegistry();
  }

  registerSkill(skill) {
    this.skillRegistry.register({ ...skill, scope: 'game' });
    return this;
  }

  registerSkills(skills = []) {
    this.skillRegistry.registerMany(skills.map((skill) => ({ ...skill, scope: 'game' })));
    return this;
  }

  hasSkill(action) {
    return this.skillRegistry.has(action);
  }

  getSkill(action) {
    return this.skillRegistry.get(action);
  }

  listSkills() {
    return this.skillRegistry.list();
  }

  executeSkill(action, context = {}) {
    return executeSkillWithTrace(this.skillRegistry, action, {
      ...context,
      state: context.state || this,
      gameType: context.gameType || this.gameType
    });
  }
}

module.exports = { BaseGameAgent };
