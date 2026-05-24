const { RoleSkillRegistry } = require('../agent-core');

const DEBATE_ROLE_ACTIONS = {
  captain: ['strategize', 'opening_argue', 'crossfire_question', 'crossfire_answer', 'free_speech', 'closing_summary', 'vote_mvp', 'postgame_speech'],
  debater: ['opening_argue', 'crossfire_question', 'crossfire_answer', 'free_speech', 'closing_summary', 'vote_mvp', 'postgame_speech'],
  judge: ['judge_review', 'vote_mvp']
};

function createDebateRoleSkillRegistry(skillRegistry) {
  const roleSkills = new RoleSkillRegistry();
  for (const [roleId, actions] of Object.entries(DEBATE_ROLE_ACTIONS)) {
    roleSkills.registerMany(roleId, actions.map((action) => skillRegistry.get(action)).filter(Boolean));
  }
  return roleSkills;
}

module.exports = { createDebateRoleSkillRegistry, DEBATE_ROLE_ACTIONS };
