const constants = require('./constants');
const workflow = require('./workflow');

workflow.registerDebateWorkflow();

module.exports = { ...constants, ...workflow };
