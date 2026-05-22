const service = require('./service');
const { formatSuccess } = require('../../utils/response');

function getRoles(req, res) { res.json(formatSuccess(service.listWerewolfRoles())); }
function getRole(req, res) { res.json(formatSuccess(service.getWerewolfRole(req.params.id))); }
function upsertRole(req, res) { res.json(formatSuccess(service.upsertWerewolfRole(req.body))); }
function deleteRole(req, res) { res.json(formatSuccess(service.deleteWerewolfRole(req.params.id))); }

function getModes(req, res) { res.json(formatSuccess(service.listWerewolfModes())); }
function getMode(req, res) { res.json(formatSuccess(service.getWerewolfMode(req.params.id))); }
function upsertMode(req, res) { res.json(formatSuccess(service.upsertWerewolfMode(req.body))); }
function deleteMode(req, res) { res.json(formatSuccess(service.deleteWerewolfMode(req.params.id))); }

module.exports = { getRoles, getRole, upsertRole, deleteRole, getModes, getMode, upsertMode, deleteMode };
