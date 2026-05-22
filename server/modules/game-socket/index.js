const service = require('./service');
const routes = require('./routes');
const constants = require('./constants');

module.exports = {
  router: routes,
  ...service,
  ...constants
};
