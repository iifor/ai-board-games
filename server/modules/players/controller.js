const service = require('./service');
const { formatSuccess } = require('../../utils/response');

function getPlayers(req, res) { res.json(formatSuccess(service.listPlayers())); }
function getPlayer(req, res) { res.json(formatSuccess(service.getPlayer(req.params.id))); }
function createPlayer(req, res) { res.status(201).json(formatSuccess(service.createPlayer(req.body))); }
function updatePlayer(req, res) { res.json(formatSuccess(service.updatePlayer(req.params.id, req.body))); }
function setPlayerEnabled(req, res) { res.json(formatSuccess(service.setPlayerEnabled(req.params.id, req.body.enabled))); }
function reorderPlayers(req, res) { res.json(formatSuccess(service.reorderPlayers(req.body))); }
function deletePlayer(req, res) { res.json(formatSuccess(service.deletePlayer(req.params.id))); }

module.exports = { getPlayers, getPlayer, createPlayer, updatePlayer, setPlayerEnabled, reorderPlayers, deletePlayer };
