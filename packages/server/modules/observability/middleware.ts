import { Router, Request, Response, NextFunction } from 'express';
import * as db from './db';

interface ApiResponse<T = unknown> {
  code: number | string;
  message: string;
  data?: T;
}

function success<T>(data: T, message = '操作成功'): ApiResponse<T> {
  return { code: 0, message, data };
}

function createRouter(): Router {
  const router = Router();

  // GET /api/admin/traces — list traces
  router.get('/traces', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { gameType, status, limit, offset } = req.query;
      const rows = db.findTraces({
        gameType: String(gameType || '') || null,
        status: String(status || '') || null,
        limit: Number(limit) || 50,
        offset: Number(offset) || 0,
      });
      res.json(success(rows));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id — full trace detail with spans
  router.get('/traces/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const trace = db.findTraceById(id);
      if (!trace) return res.status(404).json({ code: 'NOT_FOUND', message: 'Trace not found' });
      const spans = db.findSpansByTrace(id);
      res.json(success({ ...trace, spans }));
    } catch (err) { next(err); }
  });

  // DELETE /api/admin/traces/:id
  router.delete('/traces/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      db.deleteTrace(String(req.params.id));
      res.json(success({ ok: true }, 'deleted'));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id/llm — LLM calls for a trace
  router.get('/traces/:id/llm', (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = db.findLlmRecordsByTrace(String(req.params.id));
      res.json(success(rows));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id/decisions — agent decisions for a trace
  router.get('/traces/:id/decisions', (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = db.findDecisionsByTrace(String(req.params.id));
      res.json(success(rows));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id/snapshots — state snapshots for a trace
  router.get('/traces/:id/snapshots', (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = db.findSnapshotsByTrace(String(req.params.id));
      res.json(success(rows));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id/events — event stream for a trace
  router.get('/traces/:id/events', (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = db.findEventsByTrace(String(req.params.id));
      res.json(success(rows));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id/player/:playerId — per-player trace analysis
  router.get('/traces/:id/player/:playerId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const playerId = Number(req.params.playerId);
      const trace = db.findTraceById(id);
      if (!trace) return res.status(404).json({ code: 'NOT_FOUND', message: 'Trace not found' });
      const llmCalls = db.findLlmRecordsByPlayer(id, playerId);
      const decisions = db.findDecisionsByPlayer(id, playerId);
      const snapshots = db.findSnapshotsByTrace(id);
      res.json(success({ trace, llmCalls, decisions, snapshots }));
    } catch (err) { next(err); }
  });

  return router;
}

export { createRouter };
