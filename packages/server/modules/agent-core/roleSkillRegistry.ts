import { AgentSkillRegistry, AgentSkill } from './skillRegistry';

interface PlayerAgentLike {
  registerSkills: (skills: AgentSkill[]) => PlayerAgentLike;
}

class RoleSkillRegistry {
  private roles: Map<string, AgentSkillRegistry>;

  constructor() {
    this.roles = new Map();
  }

  register(roleId: string, skill: AgentSkill): this {
    if (!roleId) throw new Error('RoleSkill 缺少 roleId');
    if (!this.roles.has(roleId)) this.roles.set(roleId, new AgentSkillRegistry());
    this.roles.get(roleId)!.register({ ...skill, scope: 'role', roleId });
    return this;
  }

  registerMany(roleId: string, skills: AgentSkill[] = []): this {
    skills.forEach((skill) => this.register(roleId, skill));
    return this;
  }

  get(roleId: string, action: string): AgentSkill | null {
    return this.roles.get(roleId)?.get(action) || null;
  }

  has(roleId: string, action: string): boolean {
    return Boolean(this.get(roleId, action));
  }

  list(roleId: string | null = null): AgentSkill[] {
    if (roleId) return this.roles.get(roleId)?.list() || [];
    return Array.from(this.roles.entries()).flatMap(([id, registry]) =>
      registry.list().map((skill) => ({ ...skill, roleId: skill.roleId || id }))
    );
  }

  applyToPlayer<T extends PlayerAgentLike>(playerAgent: T, roleId: string): T {
    if (!playerAgent?.registerSkills) return playerAgent;
    playerAgent.registerSkills(this.list(roleId).map((skill) => ({ ...skill, scope: 'player', roleId })));
    return playerAgent;
  }
}

export { RoleSkillRegistry };
