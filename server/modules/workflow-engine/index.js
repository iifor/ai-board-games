const service = require('./service');
const repository = require('./repository');
const registry = require('./workflowRegistry');
const routes = require('./routes');

module.exports = {
  ...service,
  repository,
  ...registry,
  router: routes
};
