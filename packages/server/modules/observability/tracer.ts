import crypto from 'crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { trace, context, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import type { Span, Context, Attributes, AttributeValue, SpanStatus } from '@opentelemetry/api';
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import * as db from './db';
import { calcCost } from './pricing';

// ── Types ────────────────────────────────────────────────────────────

interface TraceContext {
  traceId: string;
  gameId: string;
  gameType: string;
  gameMode: string;
  rootSpan: Span;
  startedAt: string;
  status: string;
  errorMessage: string | null;
  completedAt: string | null;
  rootContext: Context;
}

interface LlmRecordInput {
  spanId?: string;
  provider?: string;
  model?: string;
  apiFormat?: string;
  playerId?: number | string | null;
  playerRole?: string;
  playerFaction?: string;
  messages?: unknown;
  responseText?: string;
  thinkingText?: string;
  temperature?: number;
  maxTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  status?: string;
  errorMessage?: string;
}

interface DecisionInput {
  spanId?: string;
  playerId: number;
  playerRole?: string;
  playerFaction?: string;
  decisionType?: string;
  phase?: string;
  day?: number;
  promptText?: string;
  responseText?: string;
  chosenTarget?: number;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  skillId?: string;
}

interface EventInput {
  spanId?: string;
  type?: string;
  phase?: string;
  day?: number;
  [key: string]: unknown;
}

interface SnapshotMeta {
  day?: number;
  phase?: string;
}

interface SnapshotInput {
  players?: Array<{ alive?: boolean }>;
  [key: string]: unknown;
}

interface OTelAttributeValue {
  toString(): string;
}

// ── OTel initialization (lazy, once) ────────────────────────────────

let tracerProvider: BasicTracerProvider | null = null;
let otelTracer: ReturnType<BasicTracerProvider['getTracer']> | null = null;
const traceWriteQueues = new Map<string, Promise<void>>();

function enqueueTraceWrite(traceId: string, operation: () => Promise<void>): Promise<void> {
  const queued = (traceWriteQueues.get(traceId) || Promise.resolve())
    .then(operation)
    .catch((error: unknown) => {
      console.error(`[observability] PostgreSQL write failed for ${traceId}:`, (error as Error).message);
    });
  traceWriteQueues.set(traceId, queued);
  return queued;
}

function ensureOtel(): void {
  if (otelTracer) return;
  const exporter = new PostgresSpanExporter();
  tracerProvider = new BasicTracerProvider({
    spanProcessors: [new BatchSpanProcessor(exporter, {
      maxQueueSize: 2048,
      scheduledDelayMillis: 5000,
      maxExportBatchSize: 512,
    })],
  });
  trace.setGlobalTracerProvider(tracerProvider);
  otelTracer = tracerProvider.getTracer('consensus-game', '1.0.0');
}

// ── SqliteSpanExporter ──────────────────────────────────────────────

class PostgresSpanExporter implements SpanExporter {
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    void Promise.all(spans.map(async (span) => {
        const sctx = span.spanContext();
        // parentSpanId is undefined for root spans; store null instead
        const parentSpanId = span.parentSpanContext?.spanId || null;
        // Read attributes safely
        const attrs: Attributes = span.attributes || {};
        const spanType = typeof attrs['span.type'] === 'string' ? attrs['span.type'] : 'unknown';
        const statusStr = statusToString(span.status);
        const errJson = (span.status && span.status.code === SpanStatusCode.ERROR && span.status.message)
          ? JSON.stringify({ message: span.status.message }) : null;

        await enqueueTraceWrite(sctx.traceId, () => db.insertSpan({
          id: sctx.spanId,
          trace_id: sctx.traceId,
          parent_span_id: parentSpanId || null,
          span_type: spanType,
          span_name: span.name || 'unknown',
          start_time: hrToISO(span.startTime) || '',
          end_time: hrToISO(span.endTime) || null,
          status: statusStr,
          attributes_json: safeJson(attrs),
          error_json: errJson,
          created_at: new Date().toISOString(),
        }));
      })).then(() => resultCallback({ code: ExportResultCode.SUCCESS })).catch((error: unknown) => {
      console.error('[PostgresSpanExporter] export failed:', (error as Error).message);
      resultCallback({ code: ExportResultCode.FAILED, error: error as Error });
    });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function hrToISO(hrTime: unknown): string | null {
  if (!hrTime || !Array.isArray(hrTime) || hrTime.length < 2) return null;
  const ms = (hrTime[0] as number) * 1000 + (hrTime[1] as number) / 1e6;
  return new Date(ms).toISOString();
}

function statusToString(status: SpanStatus): string {
  if (!status) return 'ok';
  if (status.code === SpanStatusCode.OK) return 'ok';
  if (status.code === SpanStatusCode.ERROR) return 'error';
  return 'ok';
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value || {});
  } catch {
    return '{}';
  }
}

function safeAttrValue(value: unknown): string | number | boolean {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function safeStr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function safeInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  return null;
}

// ── Active trace context store (Layer 1) ────────────────────────────

const activeTraces = new Map<string, TraceContext>();

const traceStorage = new AsyncLocalStorage<TraceContext>();

function runWithTraceContext<T>(traceContext: TraceContext, task: () => T): T {
  return traceStorage.run(traceContext, task);
}

function getCurrentTraceContext(): TraceContext | null {
  return traceStorage.getStore() || null;
}

function currentRootContext(): Context {
  return getCurrentTraceContext()?.rootContext || context.active();
}

function createTraceContext(
  gameId: string,
  gameType: string,
  gameMode: string,
  participants: Array<Record<string, unknown>> = [],
): TraceContext {
  ensureOtel();
  const rootSpan = otelTracer!.startSpan('game-root', {
    kind: SpanKind.SERVER,
    attributes: {
      'game.id': gameId,
      'game.type': gameType,
      'game.mode': safeAttrValue(gameMode),
      'span.type': 'game-root',
    },
  });
  // Set as the active root so all child spans belong to the same trace
  const rootContext = trace.setSpan(context.active(), rootSpan);
  const traceId = rootSpan.spanContext().traceId;
  const startedAt = now();

  // Immediately INSERT game_traces row for real-time tracking
  void enqueueTraceWrite(traceId, () => db.insertTrace({
    id: traceId,
    game_type: gameType,
    game_mode: safeAttrValue(gameMode) as string,
    status: 'recording',
    llm_call_count: 0,
    agent_decision_count: 0,
    event_count: 0,
    error_message: null,
    created_at: startedAt,
    completed_at: null,
    duration_ms: null,
    participants_json: JSON.stringify(participants.map((player) => ({
      seatId: Number(player.seatNumber || player.id),
      sourcePlayerId: Number(player.sourcePlayerId || player.id),
      nickname: String(player.nickname || player.name || `${player.seatNumber || player.id}号`),
    }))),
  }));

  const ctx: TraceContext = {
    traceId,
    gameId,
    gameType,
    gameMode,
    rootSpan,
    startedAt,
    status: 'recording',
    errorMessage: null,
    completedAt: null,
    rootContext,
  };
  activeTraces.set(gameId, ctx);
  traceStorage.enterWith(ctx);
  return ctx;
}

function getActiveTrace(gameId: string): TraceContext | null {
  return activeTraces.get(gameId) || null;
}

// ── Layer 2: OTel span helpers ──────────────────────────────────────

function startPhaseSpan(name: string, attributes: Attributes = {}): Span {
  ensureOtel();
  return otelTracer!.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes: sanitizeAttributes({ 'span.type': 'phase', ...attributes }),
  }, currentRootContext());
}

function startDecisionSpan(name: string, attributes: Attributes = {}): Span {
  ensureOtel();
  return otelTracer!.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes: sanitizeAttributes({ 'span.type': 'agent-decision', ...attributes }),
  }, currentRootContext());
}

function startSkillSpan(name: string, attributes: Attributes = {}): Span {
  ensureOtel();
  return otelTracer!.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes: sanitizeAttributes({ 'span.type': 'skill-execution', ...attributes }),
  }, currentRootContext());
}

function startLlmSpan(attributes: Attributes = {}): Span {
  ensureOtel();
  return otelTracer!.startSpan('chat', {
    kind: SpanKind.CLIENT,
    attributes: sanitizeAttributes({
      'span.type': 'llm-call',
      'gen_ai.operation.name': 'chat',
      ...attributes,
    }),
  }, currentRootContext());
}

// OTel only allows string | number | boolean | Array<string|number|boolean>
function sanitizeAttributes(attrs: Record<string, unknown>): Attributes {
  const out: Record<string, AttributeValue> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue; // skip null/undefined
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (Array.isArray(v)) {
      out[k] = v.filter((x): x is string | number | boolean =>
        typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean'
      ) as AttributeValue;
    }
  }
  return out;
}

function endSpan(span: Span | null, status = 'ok', attributes: Record<string, unknown> = {}, error: Error | null = null): void {
  if (!span) return;
  const clean = sanitizeAttributes(attributes);
  for (const [k, v] of Object.entries(clean)) {
    span.setAttribute(k, v);
  }
  if (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(error.message || error) });
  } else if (status === 'error') {
    span.setStatus({ code: SpanStatusCode.ERROR });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}

// ── Layer 1: Domain recorders (immediate SQLite writes) ─────────────

function recordLlmCall(ctx: TraceContext, record: LlmRecordInput): string {
  const id = uuid();
  const promptTokens = safeInt(record.promptTokens);
  const completionTokens = safeInt(record.completionTokens);
  const cost = (promptTokens != null || completionTokens != null)
    ? calcCost(record.model || '', promptTokens || 0, completionTokens || 0)
    : null;

  void enqueueTraceWrite(ctx.traceId, () => db.insertLlmRecord({
    id,
    trace_id: ctx.traceId,
    span_id: safeStr(record.spanId) || null,
    game_type: ctx.gameType,
    provider: safeStr(record.provider),
    model: safeStr(record.model),
    api_format: safeStr(record.apiFormat, 'openai-compatible'),
    player_id: record.playerId != null ? Number(record.playerId) : null,
    player_role: safeStr(record.playerRole) || null,
    player_faction: safeStr(record.playerFaction) || null,
    messages_json: safeJson(record.messages),
    response_text: safeStr(record.responseText),
    thinking_text: safeStr(record.thinkingText) || null,
    temperature: typeof record.temperature === 'number' ? record.temperature : null,
    max_tokens: safeInt(record.maxTokens),
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    latency_ms: safeInt(record.latencyMs) || 0,
    status: safeStr(record.status, 'success'),
    error_message: safeStr(record.errorMessage) || null,
    created_at: now(),
  }));

  // Increment game_traces counter
  void enqueueTraceWrite(ctx.traceId, () => db.incrementTraceCounter(ctx.traceId, 'llm_call_count'));

  return id;
}

function recordDecision(ctx: TraceContext, decision: DecisionInput): string {
  const id = uuid();
  void enqueueTraceWrite(ctx.traceId, () => db.insertDecision({
    id,
    trace_id: ctx.traceId,
    span_id: safeStr(decision.spanId) || null,
    game_type: ctx.gameType,
    player_id: decision.playerId,
    player_role: safeStr(decision.playerRole) || null,
    player_faction: safeStr(decision.playerFaction) || null,
    decision_type: safeStr(decision.decisionType, 'unknown'),
    phase: safeStr(decision.phase) || null,
    day: safeInt(decision.day),
    prompt_text: safeStr(decision.promptText) || null,
    response_text: safeStr(decision.responseText) || null,
    chosen_target: safeInt(decision.chosenTarget),
    fallback_used: decision.fallbackUsed ? 1 : 0,
    fallback_reason: safeStr(decision.fallbackReason) || null,
    skill_id: safeStr(decision.skillId) || null,
    created_at: now(),
  }));

  void enqueueTraceWrite(ctx.traceId, () => db.incrementTraceCounter(ctx.traceId, 'agent_decision_count'));

  return id;
}

function recordEvent(ctx: TraceContext, event: EventInput): void {
  void enqueueTraceWrite(ctx.traceId, () => db.insertEvent({
    trace_id: ctx.traceId,
    span_id: safeStr(event.spanId) || null,
    event_type: safeStr(event.type, 'unknown'),
    phase: safeStr(event.phase) || null,
    day: safeInt(event.day),
    event_json: safeJson(event),
    received_at: now(),
  }));

  void enqueueTraceWrite(ctx.traceId, () => db.incrementTraceCounter(ctx.traceId, 'event_count'));
}

function recordSnapshot(ctx: TraceContext, checkpoint: string, snapshot: SnapshotInput, meta: SnapshotMeta = {}): void {
  const players = snapshot.players || [];
  const alive = players.filter((p) => p.alive);
  void enqueueTraceWrite(ctx.traceId, () => db.insertSnapshot({
    trace_id: ctx.traceId,
    checkpoint: safeStr(checkpoint, 'unknown'),
    day: safeInt(meta.day),
    phase: safeStr(meta.phase) || null,
    player_count: Number.isFinite(players.length) ? players.length : 0,
    alive_count: Number.isFinite(alive.length) ? alive.length : 0,
    snapshot_json: safeJson(snapshot),
    created_at: now(),
  }));
}

function flushTrace(ctx: TraceContext | null): void {
  if (!ctx) return;
  ctx.completedAt = now();
  const durationMs = (ctx.completedAt && ctx.startedAt)
    ? new Date(ctx.completedAt).getTime() - new Date(ctx.startedAt).getTime()
    : null;

  if (ctx.rootSpan) {
    ctx.rootSpan.setStatus({ code: SpanStatusCode.OK });
    ctx.rootSpan.end();
  }

  if (tracerProvider) {
    tracerProvider.forceFlush().catch(() => {});
  }

  try {
    void enqueueTraceWrite(ctx.traceId, () => db.updateTraceStatus(ctx.traceId, {
      status: safeStr(ctx.status, 'completed'),
      error_message: safeStr(ctx.errorMessage) || null,
      completed_at: ctx.completedAt || null,
      duration_ms: Number.isFinite(durationMs) ? durationMs : null,
    }));
  } catch (error: unknown) {
    console.error('[observability] flush update failed:', (error as Error).message);
  }

  activeTraces.delete(ctx.gameId);
}

function markTraceError(ctx: TraceContext, message: string): void {
  ctx.status = 'error';
  ctx.errorMessage = message;
}

function markTraceComplete(ctx: TraceContext): void {
  ctx.status = 'completed';
}

function getTracerProvider(): BasicTracerProvider | null {
  return tracerProvider;
}

async function shutdownObservability(): Promise<void> {
  const provider = tracerProvider;
  tracerProvider = null;
  otelTracer = null;
  if (provider) await provider.shutdown();
}

export type {
  TraceContext,
  LlmRecordInput,
  DecisionInput,
  EventInput,
  SnapshotInput,
  SnapshotMeta,
};

export {
  uuid,
  now,
  createTraceContext,
  getActiveTrace,
  startPhaseSpan,
  startDecisionSpan,
  startSkillSpan,
  startLlmSpan,
  endSpan,
  recordLlmCall,
  recordDecision,
  recordEvent,
  recordSnapshot,
  flushTrace,
  markTraceError,
  markTraceComplete,
  ensureOtel,
  shutdownObservability,
  getTracerProvider,
  runWithTraceContext,
  getCurrentTraceContext,
};
