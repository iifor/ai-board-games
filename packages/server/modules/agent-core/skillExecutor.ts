import { startSkillSpan, endSpan } from '../observability/tracer';
import { AgentSkillRegistry } from './skillRegistry';
import { FallbackAudit, FallbackEntry, FallbackEvent } from './fallbackAudit';

interface PlayerAgentLike {
  hasSkill?: (action: string) => boolean;
  onFallback?: (entry: FallbackEntry) => void;
  execute?: (action: string, context: Record<string, unknown>) => Promise<unknown>;
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
  fallback?: unknown;
  fallbackAudit?: FallbackAudit;
  [key: string]: unknown;
}

async function executeSkillWithTrace(
  registry: AgentSkillRegistry,
  action: string,
  context: SkillExecutionContext = {}
): Promise<unknown> {
  const source = resolveSkillSource(registry, action, context);
  const fallbackEvents: FallbackEntry[] = [];
  const fallbackAudit: FallbackAudit | null = context.fallbackAudit ? {
    ...context.fallbackAudit,
    record(entry: FallbackEntry): FallbackEvent {
      fallbackEvents.push(entry);
      return context.fallbackAudit!.record(entry);
    }
  } : null;
  const originalOnFallback = context.actor?.playerAgent?.onFallback;
  const span = startSkillSpan(`skill:${action}`, {
    'skill.id': action,
    'game.id': (context.state?.gameId as string) || context.gameId || '',
    'game.type': context.gameType || (context.state?.gameType as string) || '',
    phase: (context.phase as PhaseLike)?.id || (context.phase as string) || '',
    'player.id': context.actor?.id != null ? String(context.actor.id) : '',
    'skill.source': source === context.actor?.playerAgent ? 'player' : 'game'
  });
  try {
    if (context.actor?.playerAgent && fallbackAudit) {
      context.actor.playerAgent.onFallback = (entry: FallbackEntry) => fallbackAudit.record(entry);
    }
    const result = await (source as { execute: (action: string, ctx: Record<string, unknown>) => Promise<unknown> }).execute(
      action,
      { ...context, action, fallbackAudit: fallbackAudit || context.fallbackAudit }
    );
    const attrs = fallbackEvents.length
      ? { 'fallback.used': true, 'fallback.count': fallbackEvents.length, 'fallback.reason': fallbackEvents[0]?.reason || 'fallback' }
      : {};
    endSpan(span, 'ok', attrs);
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (context.fallback !== undefined) {
      context.fallbackAudit?.record({
        gameType: context.gameType,
        phase: (context.phase as PhaseLike)?.id || (context.phase as string),
        skillId: action,
        actorId: context.actor?.id,
        reason: err.message,
        fallbackValue: context.fallback,
        severity: 'error'
      });
      endSpan(span, 'error', { 'fallback.used': true, 'fallback.reason': err.message }, err);
      return context.fallback;
    }
    endSpan(span, 'error', {}, err);
    throw error;
  } finally {
    if (context.actor?.playerAgent) {
      context.actor.playerAgent.onFallback = originalOnFallback;
    }
  }
}

function resolveSkillSource(
  registry: AgentSkillRegistry,
  action: string,
  context: SkillExecutionContext
): AgentSkillRegistry | PlayerAgentLike {
  if (context.actor?.playerAgent?.hasSkill?.(action)) return context.actor.playerAgent;
  return registry;
}

export { executeSkillWithTrace };
