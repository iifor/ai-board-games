const service = require('./service');
const router = require('./routes');
module.exports = { router, ...service };
