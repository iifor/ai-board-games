import { AgentSkillRegistry, AgentSkill } from './skillRegistry';
import { executeSkillWithTrace } from './skillExecutor';

interface GameAgentOptions {
  gameType?: string;
  skillRegistry?: AgentSkillRegistry | null;
}

interface SkillExecutionContext {
  state?: Record<string, unknown>;
  gameType?: string;
  [key: string]: unknown;
}

class BaseGameAgent {
  gameType: string;
  skillRegistry: AgentSkillRegistry;

  constructor({ gameType = '', skillRegistry = null }: GameAgentOptions = {}) {
    this.gameType = gameType;
    this.skillRegistry = skillRegistry || new AgentSkillRegistry();
  }

  registerSkill(skill: AgentSkill): this {
    this.skillRegistry.register({ ...skill, scope: 'game' });
    return this;
  }

  registerSkills(skills: AgentSkill[] = []): this {
    this.skillRegistry.registerMany(skills.map((skill) => ({ ...skill, scope: 'game' })));
    return this;
  }

  hasSkill(action: string): boolean {
    return this.skillRegistry.has(action);
  }

  getSkill(action: string): AgentSkill | null {
    return this.skillRegistry.get(action);
  }

  listSkills(): AgentSkill[] {
    return this.skillRegistry.list();
  }

  executeSkill(action: string, context: SkillExecutionContext = {}): Promise<unknown> {
    return executeSkillWithTrace(this.skillRegistry, action, {
      ...context,
      state: context.state || (this as unknown as Record<string, unknown>),
      gameType: context.gameType || this.gameType
    });
  }
}

export { BaseGameAgent };
