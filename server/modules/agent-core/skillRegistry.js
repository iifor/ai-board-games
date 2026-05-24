const { SkillRegistry } = require('../../../shared/schemas/skillRegistry');

class AgentSkillRegistry extends SkillRegistry {
  register(skill) {
    if (!skill?.action) throw new Error('Skill 缺少 action');
    return super.register({
      scope: skill.scope || 'game',
      ...skill
    });
  }

  registerMany(skills = []) {
    skills.forEach((skill) => this.register(skill));
    return this;
  }

  list() {
    return Array.from(this.skills.values());
  }

  actions() {
    return this.list().map((skill) => skill.action);
  }
}

module.exports = { AgentSkillRegistry };
