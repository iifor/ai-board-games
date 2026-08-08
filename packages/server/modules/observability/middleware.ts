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
  router.get('/traces', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { gameType, status, limit, offset } = req.query;
      const rows = await db.findTraces({
        gameType: String(gameType || '') || null,
        status: String(status || '') || null,
        limit: Number(limit) || 50,
        offset: Number(offset) || 0,
      });
      res.json(success(rows));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id — full trace detail with spans
  router.get('/traces/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const trace = await db.findTraceById(id);
      if (!trace) return res.status(404).json({ code: 'NOT_FOUND', message: 'Trace not found' });
      const spans = await db.findSpansByTrace(id);
      const participants = await db.resolveTraceParticipants(id);
      res.json(success({ ...trace, participants, spans }));
    } catch (err) { next(err); }
  });

  // DELETE /api/admin/traces/:id
  router.delete('/traces/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await db.deleteTrace(String(req.params.id));
      res.json(success({ ok: true }, 'deleted'));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id/llm — LLM calls for a trace
  router.get('/traces/:id/llm', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await db.findLlmRecordsByTrace(String(req.params.id));
      res.json(success(rows));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id/decisions — agent decisions for a trace
  router.get('/traces/:id/decisions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await db.findDecisionsByTrace(String(req.params.id));
      res.json(success(rows));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id/snapshots — state snapshots for a trace
  router.get('/traces/:id/snapshots', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await db.findSnapshotsByTrace(String(req.params.id));
      res.json(success(rows));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id/events — event stream for a trace
  router.get('/traces/:id/events', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await db.findEventsByTrace(String(req.params.id));
      res.json(success(rows));
    } catch (err) { next(err); }
  });

  // GET /api/admin/traces/:id/player/:playerId — per-player trace analysis
  router.get('/traces/:id/player/:playerId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const playerId = Number(req.params.playerId);
      const trace = await db.findTraceById(id);
      if (!trace) return res.status(404).json({ code: 'NOT_FOUND', message: 'Trace not found' });
      const [llmCalls, decisions, snapshots] = await Promise.all([
        db.findLlmRecordsByPlayer(id, playerId),
        db.findDecisionsByPlayer(id, playerId),
        db.findSnapshotsByTrace(id),
      ]);
      res.json(success({ trace, llmCalls, decisions, snapshots }));
    } catch (err) { next(err); }
  });

  return router;
}

export { createRouter };
