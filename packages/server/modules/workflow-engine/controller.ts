import type { Request, Response, NextFunction } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';

function getMatchDebug(req: Request, res: Response): void {
  const matchId = String(req.params.matchId);
  const state = service.getDebugState(matchId);
  if (!state) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Match not found' });
    return;
  }
  res.json(formatSuccess(state));
}

function wakeMatch(req: Request, res: Response): void {
  const matchId = String(req.params.matchId);
  res.json(formatSuccess(service.wakeTick(matchId)));
}

function submitPendingAction(req: Request, res: Response, next: NextFunction): void {
  try {
    const matchId = String(req.params.matchId);
    const actionId = String(req.params.actionId);
    res.json(formatSuccess(service.submitPendingAction({
      matchId,
      actionId,
      payload: (req.body?.payload || req.body || {}) as Record<string, unknown>,
      idempotencyKey: req.body?.idempotencyKey || '',
    })));
  } catch (error) {
    next(error);
  }
}

function retryAiTask(req: Request, res: Response, next: NextFunction): void {
  try {
    const taskId = String(req.params.taskId);
    res.json(formatSuccess(service.retryAiTask(taskId)));
  } catch (error) {
    next(error);
  }
}

function cancelAiTask(req: Request, res: Response, next: NextFunction): void {
  try {
    const taskId = String(req.params.taskId);
    res.json(formatSuccess(service.cancelAiTask(taskId, req.body?.reason || 'cancelled')));
  } catch (error) {
    next(error);
  }
}

function manualCompleteAiTask(req: Request, res: Response, next: NextFunction): void {
  try {
    const taskId = String(req.params.taskId);
    res.json(formatSuccess(service.manualCompleteAiTask(taskId, (req.body?.payload || req.body || {}) as Record<string, unknown>)));
  } catch (error) {
    next(error);
  }
}

export {
  getMatchDebug,
  wakeMatch,
  submitPendingAction,
  retryAiTask,
  cancelAiTask,
  manualCompleteAiTask,
};
