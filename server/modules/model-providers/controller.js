const service = require('./service');
const { formatSuccess } = require('../../utils/response');

function getModelProviders(req, res) { res.json(formatSuccess(service.listModelProviders())); }
function getModelProvider(req, res) { res.json(formatSuccess(service.getModelProvider(req.params.id))); }
function createModelProvider(req, res) { res.status(201).json(formatSuccess(service.createModelProvider(req.body))); }
function updateModelProvider(req, res) { res.json(formatSuccess(service.updateModelProvider(req.params.id, req.body))); }
function deleteModelProvider(req, res) { res.json(formatSuccess(service.deleteModelProvider(req.params.id))); }

module.exports = {
  getModelProviders,
  getModelProvider,
  createModelProvider,
  updateModelProvider,
  deleteModelProvider
};
