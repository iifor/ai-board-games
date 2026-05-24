const service = require('./service');
const constants = require('./constants');
const workflow = require('./workflow');

workflow.registerDebateWorkflow();

module.exports = { ...service, ...constants, ...workflow };
