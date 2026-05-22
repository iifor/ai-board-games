const service = require('./service');
const { formatSuccess } = require('../../utils/response');

function getSkins(req, res) { res.json(formatSuccess(service.listSkins())); }
function getSkin(req, res) { res.json(formatSuccess(service.getSkin(req.params.id))); }
function createSkin(req, res) { res.status(201).json(formatSuccess(service.createSkin(req.body))); }
function updateSkin(req, res) { res.json(formatSuccess(service.updateSkin(req.params.id, req.body))); }
function setSkinEnabled(req, res) { res.json(formatSuccess(service.setSkinEnabled(req.params.id, req.body.enabled))); }
function deleteSkin(req, res) { res.json(formatSuccess(service.deleteSkin(req.params.id))); }
function importMarkdownSkins(req, res) { res.json(formatSuccess(service.importMarkdownSkins())); }
function importSkinJson(req, res) { res.json(formatSuccess(service.importSkinJson(req.body))); }

module.exports = { getSkins, getSkin, createSkin, updateSkin, setSkinEnabled, deleteSkin, importMarkdownSkins, importSkinJson };
