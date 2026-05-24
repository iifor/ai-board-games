const { PlayerAgent } = require('./playerAgent');
const constants = require('./constants');
const workflow = require('./workflow');

workflow.registerWerewolfWorkflow();

module.exports = {
  PlayerAgent,
  ...workflow,
  ...constants
};
