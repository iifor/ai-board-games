const crypto = require('crypto');
const { trace, context, SpanKind, SpanStatusCode } = require('@opentelemetry/api');
const {
  BasicTracerProvider,
  BatchSpanProcessor
} = require('@opentelemetry/sdk-trace-base');
const { ExportResultCode } = require('@opentelemetry/core');
const db = require('./db');
const { calcCost } = require('./pricing');

// ── OTel initialization (lazy, once) ────────────────────────────────
let tracerProvider = null;
let otelTracer = null;

function ensureOtel() {
  if (otelTracer) return;
  const exporter = new SqliteSpanExporter();
  tracerProvider = new BasicTracerProvider({
    spanProcessors: [new BatchSpanProcessor(exporter, {
      maxQueueSize: 2048,
      scheduledDelayMillis: 5000,
      maxExportBatchSize: 512
    })]
  });
  trace.setGlobalTracerProvider(tracerProvider);
  otelTracer = tracerProvider.getTracer('consensus-game', '1.0.0');
}

// ── SqliteSpanExporter ──────────────────────────────────────────────
class SqliteSpanExporter {
  export(spans, resultCallback) {
    try {
      for (const span of spans) {
        const sctx = span.spanContext();
        // parentSpanId is undefined for root spans; store null instead
        const parentSpanId = span.parentSpanId || null;
        // Read attributes safely
        const attrs = span.attributes || {};
        const spanType = typeof attrs['span.type'] === 'string' ? attrs['span.type'] : 'unknown';
        const statusStr = span.status ? statusToString(span.status) : 'ok';
        const errJson = (span.status && span.status.code === SpanStatusCode.ERROR && span.status.message)
          ? JSON.stringify({ message: span.status.message }) : null;

        db.insertSpan({
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
          created_at: new Date().toISOString()
        });
      }
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      console.error('[SqliteSpanExporter] export failed:', error.message);
      resultCallback({ code: ExportResultCode.FAILED, error });
    }
  }

  shutdown() {
    return new Promise((resolve) => {
      if (tracerProvider) {
        tracerProvider.shutdown().then(resolve).catch(resolve);
      } else {
        resolve();
      }
    });
  }

  forceFlush() {
    return Promise.resolve();
  }
}

// ── Helpers ─────────────────────────────────────────────────────────
function uuid() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function hrToISO(hrTime) {
  if (!hrTime || !Array.isArray(hrTime) || hrTime.length < 2) return null;
  const ms = hrTime[0] * 1000 + hrTime[1] / 1e6;
  return new Date(ms).toISOString();
}

function statusToString(status) {
  if (!status) return 'ok';
  if (status.code === SpanStatusCode.OK) return 'ok';
  if (status.code === SpanStatusCode.ERROR) return 'error';
  return 'ok';
}

function safeJson(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return '{}';
  }
}

function safeStr(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function safeInt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  return null;
}

// ── Active trace context store (Layer 1) ────────────────────────────
const activeTraces = new Map();

// Module-level root OTel context — all child spans inherit this to share a single trace_id.
// Safe because only one game runs at a time (sequential Node.js event loop).
let _rootCtx = context.active();

function createTraceContext(gameId, gameType, gameMode) {
  ensureOtel();
  const rootSpan = otelTracer.startSpan('game-root', {
    kind: SpanKind.SERVER,
    attributes: {
      'game.id': gameId,
      'game.type': gameType,
      'game.mode': String(gameMode || ''),
      'span.type': 'game-root'
    }
  });
  // Set as the active root so all child spans belong to the same trace
  _rootCtx = trace.setSpan(context.active(), rootSpan);
  const traceId = rootSpan.spanContext().traceId;
  const startedAt = now();

  // Immediately INSERT game_traces row for real-time tracking
  db.insertTrace({
    id: traceId,
    game_type: gameType,
    game_mode: String(gameMode || ''),
    status: 'recording',
    llm_call_count: 0,
    agent_decision_count: 0,
    event_count: 0,
    error_message: null,
    created_at: startedAt,
    completed_at: null,
    duration_ms: null
  });

  const ctx = {
    traceId,
    gameId,
    gameType,
    gameMode,
    rootSpan,
    startedAt,
    status: 'recording',
    errorMessage: null,
    completedAt: null
  };
  activeTraces.set(gameId, ctx);
  return ctx;
}

function getActiveTrace(gameId) {
  return activeTraces.get(gameId) || null;
}

// ── Layer 2: OTel span helpers ──────────────────────────────────────
function startPhaseSpan(name, attributes = {}) {
  ensureOtel();
  return otelTracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes: sanitizeAttributes({ 'span.type': 'phase', ...attributes })
  }, _rootCtx);
}

function startDecisionSpan(name, attributes = {}) {
  ensureOtel();
  return otelTracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes: sanitizeAttributes({ 'span.type': 'agent-decision', ...attributes })
  }, _rootCtx);
}

function startSkillSpan(name, attributes = {}) {
  ensureOtel();
  return otelTracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes: sanitizeAttributes({ 'span.type': 'skill-execution', ...attributes })
  }, _rootCtx);
}

function startLlmSpan(attributes = {}) {
  ensureOtel();
  return otelTracer.startSpan('chat', {
    kind: SpanKind.CLIENT,
    attributes: sanitizeAttributes({
      'span.type': 'llm-call',
      'gen_ai.operation.name': 'chat',
      ...attributes
    })
  }, _rootCtx);
}

// OTel only allows string | number | boolean | Array<string|number|boolean>
function sanitizeAttributes(attrs) {
  const out = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue; // skip null/undefined
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (Array.isArray(v)) {
      out[k] = v.filter((x) => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean');
    }
  }
  return out;
}

function endSpan(span, status = 'ok', attributes = {}, error = null) {
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
function recordLlmCall(ctx, record) {
  const id = uuid();
  const promptTokens = safeInt(record.promptTokens);
  const completionTokens = safeInt(record.completionTokens);
  const cost = (promptTokens != null || completionTokens != null)
    ? calcCost(record.model, promptTokens || 0, completionTokens || 0)
    : null;

  db.insertLlmRecord({
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
    created_at: now()
  });

  // Increment game_traces counter
  try {
    const current = db.findTraceById(ctx.traceId);
    const prevCount = current?.llm_call_count || 0;
    db.updateTraceStatus(ctx.traceId, { llm_call_count: prevCount + 1 });
  } catch { /* best-effort */ }

  return id;
}

function recordDecision(ctx, decision) {
  const id = uuid();
  db.insertDecision({
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
    created_at: now()
  });

  try {
    const current = db.findTraceById(ctx.traceId);
    const prevCount = current?.agent_decision_count || 0;
    db.updateTraceStatus(ctx.traceId, { agent_decision_count: prevCount + 1 });
  } catch { /* best-effort */ }

  return id;
}

function recordEvent(ctx, event) {
  db.insertEvent({
    trace_id: ctx.traceId,
    span_id: safeStr(event.spanId) || null,
    event_type: safeStr(event.type, 'unknown'),
    phase: safeStr(event.phase) || null,
    day: safeInt(event.day),
    event_json: safeJson(event),
    received_at: now()
  });

  try {
    const current = db.findTraceById(ctx.traceId);
    const prevCount = current?.event_count || 0;
    db.updateTraceStatus(ctx.traceId, { event_count: prevCount + 1 });
  } catch { /* best-effort */ }
}

function recordSnapshot(ctx, checkpoint, snapshot, meta = {}) {
  const players = snapshot.players || [];
  const alive = players.filter((p) => p.alive);
  db.insertSnapshot({
    trace_id: ctx.traceId,
    checkpoint: safeStr(checkpoint, 'unknown'),
    day: safeInt(meta.day),
    phase: safeStr(meta.phase) || null,
    player_count: Number.isFinite(players.length) ? players.length : 0,
    alive_count: Number.isFinite(alive.length) ? alive.length : 0,
    snapshot_json: safeJson(snapshot),
    created_at: now()
  });
}

function flushTrace(ctx) {
  if (!ctx) return;
  ctx.completedAt = now();
  const durationMs = (ctx.completedAt && ctx.startedAt)
    ? new Date(ctx.completedAt) - new Date(ctx.startedAt)
    : null;

  if (ctx.rootSpan) {
    ctx.rootSpan.setStatus({ code: SpanStatusCode.OK });
    ctx.rootSpan.end();
  }

  if (tracerProvider) {
    tracerProvider.forceFlush().catch(() => {});
  }

  try {
    db.updateTraceStatus(ctx.traceId, {
      status: safeStr(ctx.status, 'completed'),
      error_message: safeStr(ctx.errorMessage) || null,
      completed_at: ctx.completedAt || null,
      duration_ms: Number.isFinite(durationMs) ? durationMs : null
    });
  } catch (error) {
    console.error('[observability] flush update failed:', error.message);
  }

  activeTraces.delete(ctx.gameId);
  // Reset root context so next game gets a fresh trace
  _rootCtx = context.active();
}

function markTraceError(ctx, message) {
  ctx.status = 'error';
  ctx.errorMessage = message;
}

function markTraceComplete(ctx) {
  ctx.status = 'completed';
}

module.exports = {
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
  getTracerProvider: () => tracerProvider
};
