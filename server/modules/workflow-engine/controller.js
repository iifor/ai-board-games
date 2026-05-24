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

module.exports = { getMatchDebug, wakeMatch };
