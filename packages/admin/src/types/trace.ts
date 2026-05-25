export interface Trace {
  id: string;
  game_type: string;
  status: string;
  llm_call_count: number;
  agent_decision_count: number;
  event_count: number;
  duration_ms: number;
  created_at: string;
  error_message?: string;
  spans?: Span[];
}

export interface Span {
  id: string;
  parent_span_id?: string;
  span_name: string;
  span_type: string;
  status: string;
  start_time: string;
  end_time: string;
  attributes_json?: string | Record<string, unknown>;
  error_json?: string | Record<string, unknown>;
  children?: Span[];
  depth?: number;
}

export interface LlmCall {
  id: string;
  span_id?: string;
  provider: string;
  model: string;
  status: string;
  player_id?: number;
  player_role?: string;
  latency_ms: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  temperature?: number;
  api_format?: string;
  messages_json?: string | unknown[];
  response_text?: string;
  thinking_text?: string;
  error_message?: string;
  created_at: string;
}

export interface AgentDecision {
  id: string;
  span_id?: string;
  decision_type: string;
  player_id?: number;
  player_role?: string;
  phase?: string;
  day?: number;
  chosen_target?: string;
  skill_id?: string;
  fallback_used?: boolean;
  fallback_reason?: string;
  prompt_text?: string;
  response_text?: string;
  created_at: string;
}

export interface TraceSnapshot {
  id: string;
  checkpoint: string;
  day: number;
  phase: string;
  player_count: number;
  alive_count: number;
  snapshot_json: string | Record<string, unknown>;
  created_at: string;
}

export interface TraceEvent {
  id: string;
  span_id?: string;
  event_type: string;
  phase: string;
  day: number;
  event_json: string | Record<string, unknown>;
  received_at: string;
}

export interface TokenSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface SpanContext {
  span: Span | null;
  llmCalls: LlmCall[];
  decisions: AgentDecision[];
  events: TraceEvent[];
}

export interface TraceRelations {
  spanById: Map<string, Span>;
  llmBySpanId: Map<string, LlmCall[]>;
  decisionsBySpanId: Map<string, AgentDecision[]>;
  eventsBySpanId: Map<string, TraceEvent[]>;
  getSpanContext: (spanId: string) => SpanContext;
}

export interface TimelineRow {
  id: string;
  type: 'span' | 'llm' | 'decision' | 'event';
  time: string;
  title: string;
  description: string;
  record: Span | LlmCall | AgentDecision | TraceEvent;
}

export type DetailType = 'span' | 'llm' | 'decision' | 'snapshot' | 'event';

export interface DetailDrawerState {
  type: DetailType;
  record: Span | LlmCall | AgentDecision | TraceSnapshot | TraceEvent;
}
