const service = require('./service');
const { BUILTIN_TEMPLATE, BASE_INVESTIGATION_QUESTIONS } = require('./constants');
const parser = require('./parser');
const utils = require('./utils');

module.exports = {
  ...service,
  BUILTIN_TEMPLATE,
  BASE_INVESTIGATION_QUESTIONS,
  parseSkinMarkdown: parser.parseSkinMarkdown,
  parseSkinSection: parser.parseSkinSection,
  ...utils
};
