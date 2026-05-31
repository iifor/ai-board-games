interface EngineSkill {
  id: string;
  execute: (context: Record<string, unknown>) => Promise<unknown> | unknown;
}

class EngineSkillRegistry {
  private skills = new Map<string, EngineSkill>();

  constructor(skills: EngineSkill[] = []) {
    skills.forEach((skill) => this.register(skill));
  }

  register(skill: EngineSkill): this {
    if (!skill?.id) throw new Error('EngineSkill requires id.');
    if (this.skills.has(skill.id)) throw new Error(`EngineSkill already registered: ${skill.id}`);
    this.skills.set(skill.id, skill);
    return this;
  }

  get(skillId: string): EngineSkill | null {
    return this.skills.get(skillId) || null;
  }

  has(skillId: string): boolean {
    return this.skills.has(skillId);
  }

  async execute(skillId: string, context: Record<string, unknown>): Promise<unknown> {
    const skill = this.get(skillId);
    if (!skill) throw new Error(`EngineSkill not registered: ${skillId}`);
    return skill.execute(context);
  }
}

export { EngineSkillRegistry };
export type { EngineSkill };
