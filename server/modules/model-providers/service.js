const repo = require('./repository');
const { rowToModelProvider, rowToRuntimeModelProvider, modelProviderToRow } = require('./utils');
const { AppError, ErrorCodes } = require('../../utils/errors');

function listModelProviders() {
  return repo.findAllModelProviders().map(withModelCount);
}

function getModelProvider(id) {
  const provider = withModelCount(repo.findModelProviderById(id));
  if (!provider) throw new AppError(ErrorCodes.NOT_FOUND, '供应商不存在', 404);
  return provider;
}

function getRuntimeModelProvider(id) {
  return rowToRuntimeModelProvider(repo.findModelProviderById(id));
}

function createModelProvider(input) {
  const row = modelProviderToRow(input);
  if (!row.name) throw new AppError(ErrorCodes.VALIDATION_ERROR, '供应商名称必填', 400);
  const id = repo.insertModelProvider(row);
  return getModelProvider(id);
}

function updateModelProvider(id, input) {
  const existing = repo.findModelProviderById(id);
  if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, '供应商不存在', 404);
  const row = { ...modelProviderToRow(input, existing), id: Number(id) };
  repo.updateModelProvider(row);
  return getModelProvider(id);
}

function deleteModelProvider(id) {
  if (!repo.findModelProviderById(id)) throw new AppError(ErrorCodes.NOT_FOUND, '供应商不存在', 404);
  if (repo.countModelsByProviderId(id) > 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '请先删除该供应商下的模型', 409);
  }
  repo.deleteModelProviderById(id);
  return { ok: true };
}

function createLegacyModelProvider(input) {
  return createModelProvider({
    name: input.provider,
    baseUrl: input.baseUrl || input.base_url,
    apiFormat: input.apiFormat || input.api_format,
    apiKey: input.apiKey,
    enabled: input.enabled
  });
}

function withModelCount(row) {
  if (!row) return null;
  return rowToModelProvider({ ...row, model_count: repo.countModelsByProviderId(row.id) });
}

module.exports = {
  listModelProviders,
  getModelProvider,
  getRuntimeModelProvider,
  createModelProvider,
  updateModelProvider,
  deleteModelProvider,
  createLegacyModelProvider
};
