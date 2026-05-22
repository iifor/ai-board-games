const service = require('./service');
const { formatSuccess } = require('../../utils/response');

function getVoices(req, res) { res.json(formatSuccess(service.listVoicePackages())); }
function getVoice(req, res) { res.json(formatSuccess(service.getVoicePackage(req.params.id))); }
function createVoice(req, res) { res.status(201).json(formatSuccess(service.createVoicePackage(req.body))); }
function updateVoice(req, res) { res.json(formatSuccess(service.updateVoicePackage(req.params.id, req.body))); }
function deleteVoice(req, res) { res.json(formatSuccess(service.deleteVoicePackage(req.params.id))); }
async function previewVoice(req, res) { res.json(formatSuccess(await service.previewVoice(req.params.id, req.body?.text))); }

module.exports = { getVoices, getVoice, createVoice, updateVoice, deleteVoice, previewVoice };
