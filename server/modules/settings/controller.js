const service = require('./service');
const { formatSuccess } = require('../../utils/response');

function getSettings(req, res) { res.json(formatSuccess(service.getAppSettings())); }
function setDefaultHost(req, res) { res.json(formatSuccess(service.setDefaultHostPlayerId(req.body.defaultHostPlayerId))); }

module.exports = { getSettings, setDefaultHost };
