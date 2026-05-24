const { startSkillSpan, endSpan } = require('../observability');

async function executeSkillWithTrace(registry, action, context = {}) {
  const source = resolveSkillSource(registry, action, context);
  const fallbackEvents = [];
  const fallbackAudit = context.fallbackAudit ? {
    ...context.fallbackAudit,
    record(entry) {
      fallbackEvents.push(entry);
      return context.fallbackAudit.record(entry);
    }
  } : null;
  const originalOnFallback = context.actor?.playerAgent?.onFallback;
  const span = startSkillSpan(`skill:${action}`, {
    'skill.id': action,
    'game.id': context.state?.gameId || context.gameId || '',
    'game.type': context.gameType || context.state?.gameType || '',
    phase: context.phase?.id || context.phase || '',
    'player.id': context.actor?.id != null ? String(context.actor.id) : '',
    'skill.source': source === context.actor?.playerAgent ? 'player' : 'game'
  });
  try {
    if (context.actor?.playerAgent && fallbackAudit) {
      context.actor.playerAgent.onFallback = (entry) => fallbackAudit.record(entry);
    }
    const result = await source.execute(action, { ...context, action, fallbackAudit: fallbackAudit || context.fallbackAudit });
    const attrs = fallbackEvents.length
      ? { 'fallback.used': true, 'fallback.count': fallbackEvents.length, 'fallback.reason': fallbackEvents[0]?.reason || 'fallback' }
      : {};
    endSpan(span, 'ok', attrs);
    return result;
  } catch (error) {
    if (context.fallback !== undefined) {
      context.fallbackAudit?.record({
        gameType: context.gameType,
        phase: context.phase?.id || context.phase,
        skillId: action,
        actorId: context.actor?.id,
        reason: error.message,
        fallbackValue: context.fallback,
        severity: 'error'
      });
      endSpan(span, 'error', { 'fallback.used': true, 'fallback.reason': error.message }, error);
      return context.fallback;
    }
    endSpan(span, 'error', {}, error);
    throw error;
  } finally {
    if (context.actor?.playerAgent) {
      context.actor.playerAgent.onFallback = originalOnFallback;
    }
  }
}

function resolveSkillSource(registry, action, context) {
  if (context.actor?.playerAgent?.hasSkill?.(action)) return context.actor.playerAgent;
  return registry;
}

module.exports = { executeSkillWithTrace };
