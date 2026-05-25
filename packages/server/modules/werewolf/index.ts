const { PlayerAgent } = require('./playerAgent');
import * as constants from './constants';
import * as workflow from './workflow';

workflow.registerWerewolfWorkflow();

module.exports = {
  PlayerAgent,
  ...workflow,
  ...constants
};
