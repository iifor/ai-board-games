import type { Span, LlmCall, AgentDecision, TraceEvent, TraceRelations, TimelineRow, SpanContext } from '../../types/trace';
import { translateEventTitle, translateSpanName, translatePhase, translateDecisionType, translateModelName, translateProvider } from '../../constants/traceLabels';

export function buildTraceRelations({ spans = [], llmCalls = [], decisions = [], events = [] }: {
  spans?: Span[];
  llmCalls?: LlmCall[];
  decisions?: AgentDecision[];
  events?: TraceEvent[];
}): TraceRelations {
  const spanById = new Map(spans.map((span) => [span.id, span]));
  const llmBySpanId = groupBySpanId(llmCalls);
  const decisionsBySpanId = groupBySpanId(decisions);
  const eventsBySpanId = groupBySpanId(events);

  return {
    spanById,
    llmBySpanId,
    decisionsBySpanId,
    eventsBySpanId,
    getSpanContext(spanId: string): SpanContext {
      return {
        span: spanById.get(spanId) ?? null,
        llmCalls: llmBySpanId.get(spanId) ?? [],
        decisions: decisionsBySpanId.get(spanId) ?? [],
        events: eventsBySpanId.get(spanId) ?? []
      };
    }
  };
}

type GetNickname = (playerId: number | undefined | null) => string;

export function buildTraceTimeline({ spans = [], llmCalls = [], decisions = [], events = [], getNickname }: {
  spans?: Span[];
  llmCalls?: LlmCall[];
  decisions?: AgentDecision[];
  events?: TraceEvent[];
  getNickname?: GetNickname;
}): TimelineRow[] {
  const playerName = (playerId?: number | null) =>
    getNickname ? getNickname(playerId) : (playerId ? `${playerId}号` : '');

  const rows: TimelineRow[] = [
    ...spans.map((record) => ({
      id: `span-${record.id}`,
      type: 'span' as const,
      time: record.start_time,
      title: translateSpanName(record.span_name),
      description: record.span_type,
      detail: record.id,
      record
    })),
    ...llmCalls.map((record) => ({
      id: `llm-${record.id}`,
      type: 'llm' as const,
      time: record.created_at,
      title: translateModelName(record.model),
      description: record.player_id ? playerName(record.player_id) : translateProvider(record.provider),
      detail: truncate(record.response_text, 120),
      record
    })),
    ...decisions.map((record) => ({
      id: `decision-${record.id}`,
      type: 'decision' as const,
      time: record.created_at,
      title: translateDecisionType(record.decision_type),
      description: record.player_id ? playerName(record.player_id) : record.phase ?? '',
      phase: record.phase ? translatePhase(record.phase) : undefined,
      record
    })),
    ...events.map((record) => {
      const payload = parseEventPayload(record.event_json);
      const matchId = extractMatchId(payload);
      const message = ((payload?.event as Record<string, unknown>)?.message as string) || '';
      const feedbackDescription = record.event_type === 'werewolf_interaction_feedback'
        ? describeInteractionFeedback(payload)
        : '';
      return {
        id: `event-${record.id}`,
        type: 'event' as const,
        time: record.received_at,
        title: translateEventTitle(record.event_type, payload),
        description: feedbackDescription || message || (record.phase ? translatePhase(record.phase) : ''),
        phase: record.phase ? translatePhase(record.phase) : undefined,
        detail: matchId || undefined,
        record
      };
    })
  ].filter((row) => row.time);

  return rows.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

function parseEventPayload(eventJson: string | Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!eventJson) return null;
  if (typeof eventJson === 'object') return eventJson;
  try { return JSON.parse(eventJson) as Record<string, unknown>; } catch { return null; }
}

/** 从 event payload 中提取 matchId（兼容 werewolf 嵌套结构和 debate 扁平结构） */
function extractMatchId(payload: Record<string, unknown> | null): string | undefined {
  if (!payload) return undefined;
  // werewolf: matchId 在 payload.event.matchId
  const nested = payload.event as Record<string, unknown> | undefined;
  if (nested?.matchId) return String(nested.matchId);
  // debate: matchId 直接在顶层
  if (payload.matchId) return String(payload.matchId);
  return undefined;
}

function describeInteractionFeedback(payload: Record<string, unknown> | null): string {
  if (!payload) return '';
  const parts = [
    payload.actorId != null ? `actor=${payload.actorId}` : '',
    payload.target != null ? `target=${payload.target}` : '',
    payload.result ? `result=${String(payload.result)}` : '',
    payload.scopeKey ? `scope=${String(payload.scopeKey)}` : `channel=${String(payload.channel || '')}`,
  ].filter(Boolean);
  return parts.join(' / ');
}

function truncate(text: string | undefined, maxLen: number): string | undefined {
  if (!text) return undefined;
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

function groupBySpanId<T extends { span_id?: string }>(records: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const record of records) {
    if (!record?.span_id) continue;
    const list = map.get(record.span_id) || [];
    list.push(record);
    map.set(record.span_id, list);
  }
  return map;
}
