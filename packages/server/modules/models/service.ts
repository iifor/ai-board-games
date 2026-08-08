import * as repo from './repository';
import { rowToModel, rowToRuntimeModel, modelToRow } from './utils';
import type { ModelInput } from './utils';
import { AppError, ErrorCodes } from '../../utils/errors';
import type { Model, RuntimeModel, ModelProvider } from '../../types/api';
import type { ModelRow } from '../../types/database';

interface ModelProvidersService {
  createLegacyModelProvider(input: Record<string, unknown>): Promise<ModelProvider>;
  getRuntimeModelProvider(id: number): Promise<ModelProvider | null>;
}
function getModelProvidersService(): ModelProvidersService {
  return require('../model-providers') as ModelProvidersService;
}
function getLlmService(): { testModelConnection(target: Record<string, unknown>): Promise<{ ok: boolean; latencyMs?: number; message?: string }>; clearQuotaDisabledModel(modelId: number): void } {
  return require('../llm');
}
async function getProvider(id: number | null | undefined, nullable?: boolean): Promise<ModelProvider | null> {
  const provider = id ? await getModelProvidersService().getRuntimeModelProvider(id) : null;
  if (provider || nullable) return provider;
  throw new AppError(ErrorCodes.NOT_FOUND, '供应商不存在', 404);
}
async function toModel(row: ModelRow | null | undefined): Promise<Model | null> {
  if (!row) return null;
  return rowToModel(row, await getProvider(row.provider_id, true));
}
async function listModels(): Promise<(Model | null)[]> {
  return Promise.all((await repo.findAllModels()).map(toModel));
}
async function listModelsByProvider(providerId: number): Promise<(Model | null)[]> {
  await getProvider(providerId);
  return Promise.all((await repo.findModelsByProviderId(providerId)).map(toModel));
}
async function getModel(id: number): Promise<Model | null> {
  return toModel(await repo.findModelById(id));
}
async function getRuntimeModel(id: number): Promise<RuntimeModel | null> {
  const row = await repo.findModelById(id);
  return row ? rowToRuntimeModel(row, await getProvider(row.provider_id, true)) : null;
}
async function resolveProvider(input: ModelInput): Promise<ModelProvider> {
  if (input.providerId || input.provider_id) return (await getProvider((input.providerId || input.provider_id) as number))!;
  if (input.provider) return getModelProvidersService().createLegacyModelProvider(input as unknown as Record<string, unknown>);
  throw new AppError(ErrorCodes.VALIDATION_ERROR, '请选择供应商', 400);
}
async function createModel(input: Record<string, unknown>): Promise<Model | null> {
  const provider = await resolveProvider(input as ModelInput);
  const row = modelToRow(input as ModelInput, provider);
  if (!row.provider_id || !row.name) throw new AppError(ErrorCodes.VALIDATION_ERROR, '供应商和模型名称必填', 400);
  return getModel(await repo.insertModel(row));
}
async function updateModel(id: number | string, input: Record<string, unknown>): Promise<Model | null> {
  const existing = await repo.findModelById(Number(id));
  if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, '模型不存在', 404);
  const provider = await resolveProvider({ ...(input as ModelInput), providerId: (input as ModelInput).providerId || existing.provider_id });
  const row = { ...modelToRow(input as ModelInput, provider, existing), id: Number(id) };
  if (!row.name) throw new AppError(ErrorCodes.VALIDATION_ERROR, '模型名称必填', 400);
  await repo.updateModel(row);
  if (row.enabled) getLlmService().clearQuotaDisabledModel(Number(id));
  return getModel(Number(id));
}
async function disableModel(id: number | string, reason: 'quota_exhausted' | null = null): Promise<void> {
  await repo.updateModelAvailability(id, false, reason);
}
async function deleteModel(id: number | string): Promise<{ ok: boolean }> {
  const players = require('../players/repository') as typeof import('../players/repository');
  await players.nullifyPlayerModelRefs(id);
  await repo.deleteModelById(Number(id));
  return { ok: true };
}
async function testModelConnection(id: number | string): Promise<{ ok: boolean; latencyMs?: number; message: string }> {
  const model = await getRuntimeModel(Number(id));
  if (!model) throw new AppError(ErrorCodes.NOT_FOUND, '模型不存在', 404);
  const result = await getLlmService().testModelConnection({ ...model, model: model.name, modelId: model.id });
  return { ...result, message: result.message || (result.ok ? '连接成功' : '连接失败') };
}

export { listModels, listModelsByProvider, getModel, getRuntimeModel, createModel, updateModel,
  disableModel, deleteModel, testModelConnection };
