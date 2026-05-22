const repo = require('./repository');
const { rowToModel, rowToRuntimeModel, modelToRow } = require('./utils');
const { AppError, ErrorCodes } = require('../../utils/errors');
const { getDb } = require('../../db');
const { callModelChat } = require('../llm');

function listModels() {
  return repo.findAllModels().map(rowToModel);
}

function getModel(id) {
  return rowToModel(repo.findModelById(id));
}

function getRuntimeModel(id) {
  return rowToRuntimeModel(repo.findModelById(id));
}

function createModel(input) {
  const row = modelToRow(input);
  if (!row.provider || !row.name) throw new AppError(ErrorCodes.VALIDATION_ERROR, '供应商和模型名称必填', 400);
  const id = repo.insertModel(row);
  return getModel(id);
}

function updateModel(id, input) {
  const existing = repo.findModelById(id);
  if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, '模型不存在', 404);
  const row = { ...modelToRow(input, existing), id: Number(id) };
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

module.exports = { listModels, getModel, getRuntimeModel, createModel, updateModel, deleteModel, testModelConnection };
