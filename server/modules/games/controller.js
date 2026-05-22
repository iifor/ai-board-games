const service = require('./service');
const { formatSuccess } = require('../../utils/response');

function listGames(req, res) {
  res.json(formatSuccess(service.listGames(req.query)));
}
function getGame(req, res) {
  res.json(formatSuccess(service.getGame(req.params.id)));
}
function deleteGame(req, res) {
  res.json(formatSuccess(service.deleteGame(req.params.id)));
}
function importGame(req, res) {
  res.json(formatSuccess(service.saveGameRecord(req.body)));
}
function getStats(req, res) {
  res.json(formatSuccess(service.getAdminStats()));
}

module.exports = { listGames, getGame, deleteGame, importGame, getStats };
