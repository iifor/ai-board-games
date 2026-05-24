const tracer = require('./tracer');
const pricing = require('./pricing');
const db = require('./db');
const { createRouter } = require('./middleware');

module.exports = {
  ...tracer,
  pricing,
  db,
  router: createRouter()
};
