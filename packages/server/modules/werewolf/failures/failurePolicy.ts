/**
 * 故障处理策略（简化版）
 *
 * AI 调用失败 → 记录错误 + 玩家跳过行动
 * 配置错误 → 仍然 abort（无法恢复的编程错误）
 */

interface WerewolfError extends Error {
  code?: string;
  failurePolicy?: string;
}

/** 配置/规则级别的错误仍然需要 abort（不是 AI 故障，无法恢复） */
function assertAbortableWerewolfBoundary(condition: unknown, code: string, message: string): void {
  if (condition) return;
  const error: WerewolfError = new Error(message || code || 'Werewolf boundary failed.');
  error.code = code || 'RULE_ENGINE_FAILED';
  error.failurePolicy = 'abort-game';
  throw error;
}

/** AI 任务失败统一处理：记录日志，玩家跳过 */
function getFailurePolicy(_code: string): string {
  // 所有 AI 错误统一为 skip——不再区分 abort/retry/fallback
  return 'skip-and-audit';
}

export {
  assertAbortableWerewolfBoundary,
  getFailurePolicy
};
