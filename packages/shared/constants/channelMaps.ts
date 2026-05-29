/**
 * 频道映射常量
 * 行动类型 → 作用域 和 角色 → 作用域 的映射
 * 全局唯一来源，消除 actionChannel.ts / gameEventBuilder.ts / channelRouter.ts 中的重复
 */

/** 行动类型 → 作用域 scopeKey */
export const SCOPE_ACTION_MAP: Record<string, string> = {
  wolf_kill: 'wolves',
  wolf_speech: 'wolves',
  wolf_vote: 'wolves',
  seer_check: 'seer',
  guard_protect: 'guard',
  witch_save: 'witch',
  witch_poison: 'witch',
};

/** 角色 → 作用域 scopeKey */
export const ROLE_CHANNEL_MAP: Record<string, string> = {
  werewolf: 'wolves',
  white_wolf_king: 'wolves',
  seer: 'seer',
  guard: 'guard',
  witch: 'witch',
};
