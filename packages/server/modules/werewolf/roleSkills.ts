import { RoleSkillRegistry } from '../agent-core';
import { getRoleConfig, getRoleActions } from './utils';
import type { AgentSkill } from '../agent-core/skillRegistry';

interface ModeRoleEntry {
  roleId?: string;
  id?: string;
  count?: number;
  [key: string]: unknown;
}

interface RoleConfig {
  name?: string;
  faction?: string;
  roleType?: string;
  rule?: {
    actions?: Array<{ action?: string }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface ModeConfig {
  resolvedRoles?: Array<RoleConfig & { roleId?: string }>;
  roles?: Array<string | ModeRoleEntry>;
  roleMap?: Record<string, RoleConfig>;
  [key: string]: unknown;
}

interface SkillRegistryLike {
  get: (action: string) => AgentSkill | null;
}

function createWerewolfRoleSkillRegistry(modeConfig: ModeConfig, skillRegistry: SkillRegistryLike): RoleSkillRegistry {
  const roleSkills = new RoleSkillRegistry();
  const slots: Array<string | ModeRoleEntry | RoleConfig> = Array.isArray(modeConfig?.resolvedRoles) && modeConfig.resolvedRoles.length
    ? modeConfig.resolvedRoles
    : modeConfig?.roles || [];
  for (const slot of slots) {
    const roleId = (slot as ModeRoleEntry).roleId || (slot as ModeRoleEntry).id || (slot as string);
    const roleConfig: RoleConfig = typeof slot === 'string' ? getRoleConfig(modeConfig, roleId) : { ...getRoleConfig(modeConfig, roleId), ...slot };
    const actions = [...new Set([...getRoleActions(roleConfig), 'speakOnly', 'voteOnly'])];
    roleSkills.registerMany(roleId, actions.map((action) => skillRegistry.get(action)).filter(Boolean) as AgentSkill[]);
  }
  return roleSkills;
}

export { createWerewolfRoleSkillRegistry };
