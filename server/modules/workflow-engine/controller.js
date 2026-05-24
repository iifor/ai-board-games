const service = require('./service');
const { formatSuccess } = require('../../utils/response');

function getMatchDebug(req, res) {
  const state = service.getDebugState(req.params.matchId);
  if (!state) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Match not found' });
    return;
  }
  res.json(formatSuccess(state));
}

function wakeMatch(req, res) {
  res.json(formatSuccess(service.wakeTick(req.params.matchId)));
}

function submitPendingAction(req, res, next) {
  try {
    res.json(formatSuccess(service.submitPendingAction({
      matchId: req.params.matchId,
      actionId: req.params.actionId,
      payload: req.body?.payload || req.body || {},
      idempotencyKey: req.body?.idempotencyKey || ''
    })));
  } catch (error) {
    next(error);
  }
}

function retryAiTask(req, res, next) {
  try {
    res.json(formatSuccess(service.retryAiTask(req.params.taskId)));
  } catch (error) {
    next(error);
  }
}

function cancelAiTask(req, res, next) {
  try {
    res.json(formatSuccess(service.cancelAiTask(req.params.taskId, req.body?.reason || 'cancelled')));
  } catch (error) {
    next(error);
  }
}

function manualCompleteAiTask(req, res, next) {
  try {
    res.json(formatSuccess(service.manualCompleteAiTask(req.params.taskId, req.body?.payload || req.body || {})));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMatchDebug,
  wakeMatch,
  submitPendingAction,
  retryAiTask,
  cancelAiTask,
  manualCompleteAiTask
};
