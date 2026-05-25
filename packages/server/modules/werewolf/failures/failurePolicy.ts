const ABORT_FAILURE_CODES = new Set([
  'CONFIG_INVALID',
  'SKILL_NOT_FOUND',
  'SKILL_SCHEMA_INVALID',
  'RULE_ENGINE_FAILED',
  'PHASE_TRANSITION_INVALID',
  'VISIBILITY_POLICY_FAILED',
  'EVENT_STORE_FAILED'
]);

interface WerewolfError extends Error {
  code?: string;
  failurePolicy?: string;
}

function assertAbortableWerewolfBoundary(condition: unknown, code: string, message: string): void {
  if (condition) return;
  const error: WerewolfError = new Error(message || code || 'Werewolf boundary failed.');
  error.code = code || 'RULE_ENGINE_FAILED';
  error.failurePolicy = 'abort-game';
  throw error;
}

function getFailurePolicy(code: string): string {
  if (ABORT_FAILURE_CODES.has(code)) return 'abort-game';
  if (code === 'AGENT_TIMEOUT' || code === 'AGENT_JSON_INVALID') return 'retry-then-fallback';
  return 'fallback-and-audit';
}

export {
  assertAbortableWerewolfBoundary,
  getFailurePolicy
};
