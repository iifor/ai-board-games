class SkillRegistry {
  constructor(skills = []) {
    this.skills = new Map();
    skills.forEach((skill) => this.register(skill));
  }

  register(skill) {
    if (!skill?.action) throw new Error('Skill 缺少 action');
    this.skills.set(skill.action, skill);
    return this;
  }

  get(action) {
    return this.skills.get(action) || null;
  }

  has(action) {
    return this.skills.has(action);
  }

  async execute(action, context) {
    const skill = this.get(action);
    if (!skill?.execute) throw new Error(`未注册可执行 Skill：${action}`);
    return skill.execute(context);
  }
}

module.exports = { SkillRegistry };
