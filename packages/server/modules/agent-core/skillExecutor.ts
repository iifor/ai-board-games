import { startSkillSpan, endSpan, getActiveTrace, recordDecision } from '../observability/tracer';
import { AgentSkillRegistry } from './skillRegistry';
import { FallbackEntry } from './fallbackAudit';

interface PlayerAgentLike {
  hasSkill?: (action: string) => boolean;
  onError?: (entry: FallbackEntry) => void;
  execute?: (action: string, context: Record<string, unknown>) => Promise<unknown>;
  executeSkill?: (action: string, context: Record<string, unknown>) => Promise<unknown>;
}

interface ActorLike {
  id?: string | number;
  playerAgent?: PlayerAgentLike;
}

interface PhaseLike {
  id?: string;
}

interface SkillExecutionContext {
  actor?: ActorLike;
  state?: Record<string, unknown>;
  gameId?: string;
  gameType?: string;
  phase?: PhaseLike | string;
  fallbackAudit?: { record: (entry: FallbackEntry) => unknown };
  [key: string]: unknown;
}

/**
 * 执行技能并记录追踪信息。
 * AI 调用失败时重抛异常——不使用兜底值。
 * 错误信息通过 onError 回调记录到审计日志。
 */
async function executeSkillWithTrace(
  registry: AgentSkillRegistry,
  action: string,
  context: SkillExecutionContext = {}
): Promise<unknown> {
  const source = resolveSkillSource(registry, action, context);
  const span = startSkillSpan(`skill:${action}`, {
    'skill.id': action,
    'game.id': (context.state?.gameId as string) || context.gameId || '',
    'game.type': context.gameType || (context.state?.gameType as string) || '',
    phase: (context.phase as PhaseLike)?.id || (context.phase as string) || '',
    'player.id': context.actor?.id != null ? String(context.actor.id) : '',
    'skill.source': source === context.actor?.playerAgent ? 'player' : 'game'
  });

  try {
    const executionContext = { ...context, action };
    const result = await executeResolvedSource(source, action, executionContext);
    endSpan(span, 'ok', {});
    // 记录 AI 决策到 trace
    recordDecisionForTrace(context, action, result, true);
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    context.actor?.playerAgent?.onError?.({
      gameType: context.gameType || '',
      phase: (context.phase as PhaseLike)?.id || (context.phase as string) || null,
      skillId: action,
      actorId: context.actor?.id,
      reason: err.message,
      fallbackValue: null,
      severity: 'error'
    });
    endSpan(span, 'error', {}, err);
    // 记录失败决策到 trace
    recordDecisionForTrace(context, action, null, false, err.message);
    throw err;
  }
}

function executeResolvedSource(
  source: AgentSkillRegistry | PlayerAgentLike,
  action: string,
  context: Record<string, unknown>
): Promise<unknown> {
  if ('executeSkill' in source && typeof source.executeSkill === 'function') {
    return source.executeSkill(action, context);
  }
  if ('execute' in source && typeof source.execute === 'function') {
    return source.execute(action, context);
  }
  throw new Error(`Skill source cannot execute action: ${action}`);
}

function resolveSkillSource(
  registry: AgentSkillRegistry,
  action: string,
  context: SkillExecutionContext
): AgentSkillRegistry | PlayerAgentLike {
  if (context.actor?.playerAgent?.hasSkill?.(action)) return context.actor.playerAgent;
  return registry;
}

function recordDecisionForTrace(
  context: SkillExecutionContext, action: string, result: unknown, success: boolean, errorReason?: string
): void {
  try {
    const gameId = context.gameId || (context.state as Record<string, unknown> | undefined)?.gameId as string || '';
    const trace = getActiveTrace(gameId);
    if (!trace) return;
    const data = result as Record<string, unknown> | null | undefined;
    recordDecision(trace, {
      playerId: context.actor?.id != null ? Number(context.actor.id) : undefined,
      playerRole: (context.actor as Record<string, unknown> | undefined)?.role as string || undefined,
      playerFaction: (context.actor as Record<string, unknown> | undefined)?.faction as string || undefined,
      decisionType: action,
      phase: (context.phase as PhaseLike)?.id || (context.phase as string) || '',
      day: (context.state as Record<string, unknown> | undefined)?.day as number || (context as Record<string, unknown>).day as number || undefined,
      skillId: action,
      responseText: data ? JSON.stringify(data) : null,
      chosenTarget: data?.target != null ? Number(data.target) : undefined,
      fallbackUsed: !success,
      fallbackReason: errorReason || null,
    });
  } catch { /* trace 记录失败不影响主流程 */ }
}

export { executeSkillWithTrace };
