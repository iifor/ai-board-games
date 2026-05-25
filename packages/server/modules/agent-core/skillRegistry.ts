import { SkillRegistry, Skill } from '@ai-presenter/shared/schemas/skillRegistry';

interface AgentSkill extends Skill {
  scope?: string;
  roleId?: string;
}

class AgentSkillRegistry extends SkillRegistry {
  register(skill: AgentSkill): this {
    if (!skill?.action) throw new Error('Skill 缺少 action');
    return super.register({
      scope: skill.scope || 'game',
      ...skill
    });
  }

  registerMany(skills: AgentSkill[] = []): this {
    skills.forEach((skill) => this.register(skill));
    return this;
  }

  list(): AgentSkill[] {
    return Array.from(this.skills.values()) as AgentSkill[];
  }

  actions(): string[] {
    return this.list().map((skill) => skill.action);
  }
}

export { AgentSkillRegistry };
export type { AgentSkill };
