export function buildTraceRelations({ spans = [], llmCalls = [], decisions = [], events = [] }) {
  const spanById = new Map(spans.map((span) => [span.id, span]));
  const llmBySpanId = groupBySpanId(llmCalls);
  const decisionsBySpanId = groupBySpanId(decisions);
  const eventsBySpanId = groupBySpanId(events);

  return {
    spanById,
    llmBySpanId,
    decisionsBySpanId,
    eventsBySpanId,
    getSpanContext(spanId) {
      return {
        span: spanById.get(spanId) || null,
        llmCalls: llmBySpanId.get(spanId) || [],
        decisions: decisionsBySpanId.get(spanId) || [],
        events: eventsBySpanId.get(spanId) || []
      };
    }
  };
}

export function buildTraceTimeline({ spans = [], llmCalls = [], decisions = [], events = [] }) {
  const rows = [
    ...spans.map((record) => ({
      id: `span-${record.id}`,
      type: 'span',
      time: record.start_time,
      title: record.span_name,
      description: record.span_type,
      record
    })),
    ...llmCalls.map((record) => ({
      id: `llm-${record.id}`,
      type: 'llm',
      time: record.created_at,
      title: record.model,
      description: record.player_id ? `玩家 ${record.player_id}` : record.provider,
      record
    })),
    ...decisions.map((record) => ({
      id: `decision-${record.id}`,
      type: 'decision',
      time: record.created_at,
      title: record.decision_type,
      description: record.player_id ? `玩家 ${record.player_id}` : record.phase,
      record
    })),
    ...events.map((record) => ({
      id: `event-${record.id}`,
      type: 'event',
      time: record.received_at,
      title: record.event_type,
      description: record.phase,
      record
    }))
  ].filter((row) => row.time);

  return rows.sort((a, b) => new Date(a.time) - new Date(b.time));
}

function groupBySpanId(records) {
  const map = new Map();
  for (const record of records) {
    if (!record?.span_id) continue;
    const list = map.get(record.span_id) || [];
    list.push(record);
    map.set(record.span_id, list);
  }
  return map;
}
