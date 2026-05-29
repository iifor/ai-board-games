/**
 * 观众配置选项
 */

import type { AudienceOptions } from './audienceStream';

// ============================================================
// 预设配置
// ============================================================

/** 上帝视角 - 可以看到所有信息 */
export const GOD_VIEW_OPTIONS: AudienceOptions = {
  viewMode: 'god'
};

/** 观众视角 - 公开信息 + 延迟播报 */
export const AUDIENCE_VIEW_OPTIONS: AudienceOptions = {
  viewMode: 'god',
  delayMs: 2000,
  speed: 1,
  interactive: false
};

/** 玩家视角 - 限制可见信息 */
export function createPlayerViewOptions(
  playerId: number,
  faction: string,
  roles: string[] = []
): AudienceOptions {
  return {
    viewMode: 'player',
    viewerPlayerId: playerId,
    viewerFaction: faction,
    viewerRoles: roles
  };
}

/** 狼人视角 */
export function createWolfViewOptions(playerId: number): AudienceOptions {
  return createPlayerViewOptions(playerId, 'wolves');
}

/** 预言家视角 */
export function createSeerViewOptions(playerId: number): AudienceOptions {
  return createPlayerViewOptions(playerId, 'good', ['seer']);
}

/** 女巫视角 */
export function createWitchViewOptions(playerId: number): AudienceOptions {
  return createPlayerViewOptions(playerId, 'good', ['witch']);
}

/** 守卫视角 */
export function createGuardViewOptions(playerId: number): AudienceOptions {
  return createPlayerViewOptions(playerId, 'good', ['guard']);
}

/** 只看发言 - 过滤掉系统事件 */
export const SPEECH_ONLY_OPTIONS: AudienceOptions = {
  viewMode: 'god',
  filter: (event) =>
    event.type === 'speech' ||
    event.type === 'wolf-speech' ||
    event.type === 'self-destruct' ||
    event.type === 'last-words' ||
    event.type === 'exile-words'
};

/** 只看夜晚 - 过滤掉白天事件 */
export const NIGHT_ONLY_OPTIONS: AudienceOptions = {
  viewMode: 'god',
  filter: (event) =>
    event.metadata.phase === 'night' ||
    event.type === 'phase-start' ||
    event.type === 'night-result'
};

/** 只看白天 - 过滤掉夜晚事件 */
export const DAY_ONLY_OPTIONS: AudienceOptions = {
  viewMode: 'god',
  filter: (event) =>
    event.metadata.phase === 'day' ||
    event.type === 'day-start' ||
    event.type === 'vote-result'
};

/** 高速回放 - 4 倍速 */
export const FAST_REPLAY_OPTIONS: AudienceOptions = {
  viewMode: 'god',
  speed: 4
};

/** 慢速回放 - 0.5 倍速 */
export const SLOW_REPLAY_OPTIONS: AudienceOptions = {
  viewMode: 'god',
  speed: 0.5
};

// ============================================================
// 工具函数
// ============================================================

export function mergeOptions(
  base: AudienceOptions,
  overrides: Partial<AudienceOptions>
): AudienceOptions {
  return { ...base, ...overrides };
}

export function isValidSpeed(speed: number): boolean {
  return speed >= 0.25 && speed <= 4;
}

export function clampSpeed(speed: number): number {
  return Math.max(0.25, Math.min(4, speed));
}
