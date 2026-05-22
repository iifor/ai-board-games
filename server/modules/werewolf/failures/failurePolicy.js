const ABORT_FAILURE_CODES = new Set([
  'CONFIG_INVALID',
  'SKILL_NOT_FOUND',
  'SKILL_SCHEMA_INVALID',
  'RULE_ENGINE_FAILED',
  'PHASE_TRANSITION_INVALID',
  'VISIBILITY_POLICY_FAILED',
  'EVENT_STORE_FAILED'
]);

function assertAbortableWerewolfBoundary(condition, code, message) {
  if (condition) return;
  const error = new Error(message || code || 'Werewolf boundary failed.');
  error.code = code || 'RULE_ENGINE_FAILED';
  error.failurePolicy = 'abort-game';
  throw error;
}

function getFailurePolicy(code) {
  if (ABORT_FAILURE_CODES.has(code)) return 'abort-game';
  if (code === 'AGENT_TIMEOUT' || code === 'AGENT_JSON_INVALID') return 'retry-then-fallback';
  return 'fallback-and-audit';
}

module.exports = {
  assertAbortableWerewolfBoundary,
  getFailurePolicy
};
