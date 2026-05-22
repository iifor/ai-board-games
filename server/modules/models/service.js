const repo = require('./repository');
const { rowToModel, rowToRuntimeModel, modelToRow } = require('./utils');
const { AppError, ErrorCodes } = require('../../utils/errors');
const { callModelChat } = require('../llm');

function listModels() {
  return repo.findAllModels().map(toModel);
}

function listModelsByProvider(providerId) {
  getProvider(providerId);
  return repo.findModelsByProviderId(providerId).map(toModel);
}

function getModel(id) {
  return toModel(repo.findModelById(id));
}

function getRuntimeModel(id) {
  const row = repo.findModelById(id);
  if (!row) return null;
  return rowToRuntimeModel(row, getProvider(row.provider_id, true));
}

function createModel(input) {
  const provider = resolveProvider(input);
  const row = modelToRow(input, provider);
  if (!row.provider_id || !row.name) throw new AppError(ErrorCodes.VALIDATION_ERROR, '供应商和模型名称必填', 400);
  const id = repo.insertModel(row);
  return getModel(id);
}

function updateModel(id, input) {
  const existing = repo.findModelById(id);
  if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, '模型不存在', 404);
  const provider = resolveProvider({ ...input, providerId: input.providerId || existing.provider_id });
  const row = { ...modelToRow(input, provider, existing), id: Number(id) };
  if (!row.name) throw new AppError(ErrorCodes.VALIDATION_ERROR, '模型名称必填', 400);
  repo.updateModel(row);
  return getModel(id);
}

function deleteModel(id) {
  const players = require('../players/repository');
  players.nullifyPlayerModelRefs(id);
  repo.deleteModelById(id);
  return { ok: true };
}

async function testModelConnection(id) {
  const model = getRuntimeModel(id);
  if (!model) throw new AppError(ErrorCodes.NOT_FOUND, '模型不存在', 404);
  return callModelChat({
    ...model,
    model: model.name,
    messages: [{ role: 'user', content: '请只回复 pong' }],
    temperature: 0, maxTokens: 16
  }).then(reply => ({ ok: true, message: reply || '连接成功' }))
    .catch(err => ({ ok: false, message: err.message }));
}

function toModel(row) {
  if (!row) return null;
  return rowToModel(row, getProvider(row.provider_id, true));
}

function resolveProvider(input) {
  if (input.providerId || input.provider_id) return getProvider(input.providerId || input.provider_id);
  if (input.provider) return require('../model-providers').createLegacyModelProvider(input);
  throw new AppError(ErrorCodes.VALIDATION_ERROR, '请选择供应商', 400);
}

function getProvider(id, nullable = false) {
  const provider = id ? require('../model-providers').getRuntimeModelProvider(id) : null;
  if (provider || nullable) return provider;
  throw new AppError(ErrorCodes.NOT_FOUND, '供应商不存在', 404);
}

module.exports = {
  listModels, listModelsByProvider, getModel, getRuntimeModel,
  createModel, updateModel, deleteModel, testModelConnection
};
