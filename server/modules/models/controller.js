const service = require('./service');
const { formatSuccess } = require('../../utils/response');

function getModels(req, res) { res.json(formatSuccess(service.listModels())); }
function getProviderModels(req, res) { res.json(formatSuccess(service.listModelsByProvider(req.params.providerId))); }
function getModel(req, res) { res.json(formatSuccess(service.getModel(req.params.id))); }
function createModel(req, res) { res.status(201).json(formatSuccess(service.createModel(req.body))); }
function createProviderModel(req, res) {
  res.status(201).json(formatSuccess(service.createModel({ ...req.body, providerId: Number(req.params.providerId) })));
}
function updateModel(req, res) { res.json(formatSuccess(service.updateModel(req.params.id, req.body))); }
function deleteModel(req, res) { res.json(formatSuccess(service.deleteModel(req.params.id))); }
async function testModel(req, res) { res.json(formatSuccess(await service.testModelConnection(req.params.id))); }

module.exports = { getModels, getProviderModels, getModel, createModel, createProviderModel, updateModel, deleteModel, testModel };
