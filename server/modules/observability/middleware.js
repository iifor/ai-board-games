const express = require('express');
const db = require('./db');

function success(data, message = '操作成功') {
  return { code: 0, message, data };
}

function createRouter() {
  const router = express.Router();

  // GET /api/admin/traces — list traces
  router.get('/traces', (req, res, next) => {
    try {
      const { gameType, status, limit, offset } = req.query;
      const rows = db.findTraces({
        gameType: gameType || null,
        status: status || null,
        limit: Number(limit) || 50,
        offset: Number(offset) || 0
      });
      res.json(success(rows));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id — full trace detail with spans
  router.get('/traces/:id', (req, res, next) => {
    try {
      const trace = db.findTraceById(req.params.id);
      if (!trace) return res.status(404).json({ code: 'NOT_FOUND', message: 'Trace not found' });
      const spans = db.findSpansByTrace(req.params.id);
      trace.spans = spans;
      res.json(success(trace));
    } catch (err) { next(err); }
  });

  // DELETE /api/admin/traces/:id
  router.delete('/traces/:id', (req, res, next) => {
    try {
      db.deleteTrace(req.params.id);
      res.json(success({ ok: true }, 'deleted'));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id/llm — LLM calls for a trace
  router.get('/traces/:id/llm', (req, res, next) => {
    try {
      const rows = db.findLlmRecordsByTrace(req.params.id);
      res.json(success(rows));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id/decisions — agent decisions for a trace
  router.get('/traces/:id/decisions', (req, res, next) => {
    try {
      const rows = db.findDecisionsByTrace(req.params.id);
      res.json(success(rows));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id/snapshots — state snapshots for a trace
  router.get('/traces/:id/snapshots', (req, res, next) => {
    try {
      const rows = db.findSnapshotsByTrace(req.params.id);
      res.json(success(rows));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id/events — event stream for a trace
  router.get('/traces/:id/events', (req, res, next) => {
    try {
      const rows = db.findEventsByTrace(req.params.id);
      res.json(success(rows));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id/player/:playerId — per-player trace analysis
  router.get('/traces/:id/player/:playerId', (req, res, next) => {
    try {
      const { id, playerId } = req.params;
      const trace = db.findTraceById(id);
      if (!trace) return res.status(404).json({ code: 'NOT_FOUND', message: 'Trace not found' });
      const llmCalls = db.findLlmRecordsByPlayer(id, Number(playerId));
      const decisions = db.findDecisionsByPlayer(id, Number(playerId));
      const snapshots = db.findSnapshotsByTrace(id);
      res.json(success({ trace, llmCalls, decisions, snapshots }));
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { createRouter };
