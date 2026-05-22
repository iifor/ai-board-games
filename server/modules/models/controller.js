const service = require('./service');
const { formatSuccess } = require('../../utils/response');

function getModels(req, res) { res.json(formatSuccess(service.listModels())); }
function getModel(req, res) { res.json(formatSuccess(service.getModel(req.params.id))); }
function createModel(req, res) { res.status(201).json(formatSuccess(service.createModel(req.body))); }
function updateModel(req, res) { res.json(formatSuccess(service.updateModel(req.params.id, req.body))); }
function deleteModel(req, res) { res.json(formatSuccess(service.deleteModel(req.params.id))); }
async function testModel(req, res) { res.json(formatSuccess(await service.testModelConnection(req.params.id))); }

module.exports = { getModels, getModel, createModel, updateModel, deleteModel, testModel };
