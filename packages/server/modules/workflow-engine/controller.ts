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

function createInterrupt(req: Request, res: Response, next: NextFunction): void {
  try {
    const matchId = String(req.params.matchId);
    res.json(formatSuccess(service.createInterrupt({
      matchId,
      stepId: req.body?.stepId || null,
      effectId: req.body?.effectId || null,
      interruptType: String(req.body?.interruptType || 'manual_debug'),
      priority: Number(req.body?.priority || 0),
      payload: (req.body?.payload || {}) as Record<string, unknown>,
    })));
  } catch (error) {
    next(error);
  }
}

function resolveInterrupt(req: Request, res: Response, next: NextFunction): void {
  try {
    const interruptId = String(req.params.interruptId);
    res.json(formatSuccess(service.resolveWorkflowInterrupt(
      interruptId,
      String(req.body?.status || 'resolved'),
      req.body?.resolution || {},
    )));
  } catch (error) {
    next(error);
  }
}

function controlUndercoverDebug(req: Request, res: Response, next: NextFunction): void {
  try {
    const matchId = String(req.params.matchId);
    const action = String(req.body?.action || '');
    res.json(formatSuccess(service.controlUndercoverDebugMatch(
      matchId,
      action as service.UndercoverDebugAction,
    )));
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
  createInterrupt,
  resolveInterrupt,
  controlUndercoverDebug,
};
