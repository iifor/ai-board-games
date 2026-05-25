import type { Span, LlmCall, AgentDecision, TraceEvent, TraceRelations, TimelineRow, SpanContext } from '../../types/trace';

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

export function buildTraceTimeline({ spans = [], llmCalls = [], decisions = [], events = [] }: {
  spans?: Span[];
  llmCalls?: LlmCall[];
  decisions?: AgentDecision[];
  events?: TraceEvent[];
}): TimelineRow[] {
  const rows: TimelineRow[] = [
    ...spans.map((record) => ({
      id: `span-${record.id}`,
      type: 'span' as const,
      time: record.start_time,
      title: record.span_name,
      description: record.span_type,
      record
    })),
    ...llmCalls.map((record) => ({
      id: `llm-${record.id}`,
      type: 'llm' as const,
      time: record.created_at,
      title: record.model,
      description: record.player_id ? `玩家 ${record.player_id}` : record.provider,
      record
    })),
    ...decisions.map((record) => ({
      id: `decision-${record.id}`,
      type: 'decision' as const,
      time: record.created_at,
      title: record.decision_type,
      description: record.player_id ? `玩家 ${record.player_id}` : record.phase ?? '',
      record
    })),
    ...events.map((record) => ({
      id: `event-${record.id}`,
      type: 'event' as const,
      time: record.received_at,
      title: record.event_type,
      description: record.phase,
      record
    }))
  ].filter((row) => row.time);

  return rows.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
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
