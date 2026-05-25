interface Skill {
  action: string;
  execute?: (context: unknown) => Promise<unknown>;
}

class SkillRegistry {
  protected skills: Map<string, Skill>;

  constructor(skills: Skill[] = []) {
    this.skills = new Map();
    skills.forEach((skill) => this.register(skill));
  }

  register(skill: Skill): this {
    if (!skill?.action) throw new Error('Skill 缺少 action');
    this.skills.set(skill.action, skill);
    return this;
  }

  get(action: string): Skill | null {
    return this.skills.get(action) || null;
  }

  has(action: string): boolean {
    return this.skills.has(action);
  }

  async execute(action: string, context: unknown): Promise<unknown> {
    const skill = this.get(action);
    if (!skill?.execute) throw new Error(`未注册可执行 Skill：${action}`);
    return skill.execute(context);
  }
}

export { SkillRegistry };
export type { Skill };
