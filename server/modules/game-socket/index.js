const service = require('./service');
const routes = require('../../routes/gameRoutes');
const constants = require('./constants');
const session = require('./session');
const { createPreparedSender } = require('./sender');
const { replayGameSession } = require('./replay');

module.exports = {
  router: routes,
  attachGameSocket: service.attachGameSocket,
  runSession: service.runSession,
  createSession: session.createSession,
  createPreparedSender,
  replayGameSession,
  ...constants
};
