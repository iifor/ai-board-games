import { RoleSkillRegistry } from '../agent-core';

interface Skill {
  action: string;
  [key: string]: unknown;
}

interface SkillRegistry {
  get(action: string): Skill | null;
}

const DEBATE_ROLE_ACTIONS: Record<string, string[]> = {
  captain: ['strategize', 'opening_argue', 'crossfire_question', 'crossfire_answer', 'free_speech', 'closing_summary', 'vote_mvp', 'postgame_speech'],
  debater: ['opening_argue', 'crossfire_question', 'crossfire_answer', 'free_speech', 'closing_summary', 'vote_mvp', 'postgame_speech'],
  judge: ['judge_review', 'vote_mvp'],
} as const;

function createDebateRoleSkillRegistry(skillRegistry: SkillRegistry): InstanceType<typeof RoleSkillRegistry> {
  const roleSkills = new RoleSkillRegistry();
  for (const [roleId, actions] of Object.entries(DEBATE_ROLE_ACTIONS)) {
    roleSkills.registerMany(roleId, actions.map((action) => skillRegistry.get(action)).filter(Boolean) as Skill[]);
  }
  return roleSkills;
}

export { createDebateRoleSkillRegistry, DEBATE_ROLE_ACTIONS };
