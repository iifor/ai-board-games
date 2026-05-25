import * as repo from './repository';
import { rowToModel, rowToRuntimeModel, modelToRow } from './utils';
import type { ModelInput } from './utils';
import { AppError, ErrorCodes } from '../../utils/errors';
import type { Model, RuntimeModel, ModelProvider } from '../../types/api';
import type { ModelRow } from '../../types/database';

// Lazy-loaded to avoid circular deps
function getModelProvidersService(): { createLegacyModelProvider: (input: Record<string, unknown>) => ModelProvider; getRuntimeModelProvider: (id: number) => ModelProvider | null } {
  return require('../model-providers') as { createLegacyModelProvider: (input: Record<string, unknown>) => ModelProvider; getRuntimeModelProvider: (id: number) => ModelProvider | null };
}

function getLlmService(): { callModelChat: (target: Record<string, unknown>) => Promise<string> } {
  return require('../llm') as { callModelChat: (target: Record<string, unknown>) => Promise<string> };
}

function listModels(): (Model | null)[] {
  return repo.findAllModels().map(toModel);
}

function listModelsByProvider(providerId: number): (Model | null)[] {
  getProvider(providerId);
  return repo.findModelsByProviderId(providerId).map(toModel);
}

function getModel(id: number): Model | null {
  return toModel(repo.findModelById(id));
}

function getRuntimeModel(id: number): RuntimeModel | null {
  const row = repo.findModelById(id);
  if (!row) return null;
  return rowToRuntimeModel(row, getProvider(row.provider_id, true));
}

function createModel(input: Record<string, unknown>): Model | null {
  const provider = resolveProvider(input as ModelInput);
  const row = modelToRow(input as ModelInput, provider);
  if (!row.provider_id || !row.name) throw new AppError(ErrorCodes.VALIDATION_ERROR, '供应商和模型名称必填', 400);
  const id = repo.insertModel(row);
  return getModel(id);
}

function updateModel(id: number | string, input: Record<string, unknown>): Model | null {
  const existing = repo.findModelById(Number(id));
  if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, '模型不存在', 404);
  const provider = resolveProvider({ ...(input as ModelInput), providerId: (input as ModelInput).providerId || existing.provider_id });
  const row = { ...modelToRow(input as ModelInput, provider, existing), id: Number(id) };
  if (!row.name) throw new AppError(ErrorCodes.VALIDATION_ERROR, '模型名称必填', 400);
  repo.updateModel(row);
  return getModel(Number(id));
}

function deleteModel(id: number | string): { ok: boolean } {
  const players = require('../players/repository') as { nullifyPlayerModelRefs: (id: number | string) => void };
  players.nullifyPlayerModelRefs(id);
  repo.deleteModelById(Number(id));
  return { ok: true };
}

async function testModelConnection(id: number | string): Promise<{ ok: boolean; message: string }> {
  const model = getRuntimeModel(Number(id));
  if (!model) throw new AppError(ErrorCodes.NOT_FOUND, '模型不存在', 404);
  const llm = getLlmService();
  return llm.callModelChat({
    ...model,
    model: model.name,
    messages: [{ role: 'user', content: '请只回复 pong' }],
    temperature: 0, maxTokens: 16
  }).then((reply: string) => ({ ok: true, message: reply || '连接成功' }))
    .catch((err: Error) => ({ ok: false, message: err.message }));
}

function toModel(row: ModelRow | null | undefined): Model | null {
  if (!row) return null;
  return rowToModel(row, getProvider(row.provider_id, true));
}

function resolveProvider(input: ModelInput): ModelProvider {
  if (input.providerId || input.provider_id) return getProvider((input.providerId || input.provider_id) as number);
  if (input.provider) return getModelProvidersService().createLegacyModelProvider(input as unknown as Record<string, unknown>);
  throw new AppError(ErrorCodes.VALIDATION_ERROR, '请选择供应商', 400);
}

function getProvider(id: number | null | undefined, nullable?: boolean): ModelProvider | null {
  const provider = id ? getModelProvidersService().getRuntimeModelProvider(id) : null;
  if (provider || nullable) return provider;
  throw new AppError(ErrorCodes.NOT_FOUND, '供应商不存在', 404);
}

export { listModels, listModelsByProvider, getModel, getRuntimeModel, createModel, updateModel, deleteModel, testModelConnection };
