import * as repo from './repository';
import { rowToModelProvider, rowToRuntimeModelProvider, modelProviderToRow } from './utils';
import { AppError, ErrorCodes } from '../../utils/errors';
import type { ModelProvider } from '../../types/api';
import type { ModelProviderRow } from '../../types/database';
import type { ModelProviderInput } from './utils';

async function withModelCount(row: ModelProviderRow | null): Promise<ModelProvider | null> {
  if (!row) return null;
  return rowToModelProvider({ ...row, model_count: await repo.countModelsByProviderId(row.id) });
}
async function listModelProviders(): Promise<ModelProvider[]> {
  const providers = await Promise.all((await repo.findAllModelProviders()).map(withModelCount));
  return providers.filter((provider): provider is ModelProvider => provider !== null);
}
async function getModelProvider(id: string | number): Promise<ModelProvider> {
  const provider = await withModelCount(await repo.findModelProviderById(id));
  if (!provider) throw new AppError(ErrorCodes.NOT_FOUND, '供应商不存在', 404);
  return provider;
}
async function getRuntimeModelProvider(id: string | number): Promise<ModelProvider | null> {
  return rowToRuntimeModelProvider(await repo.findModelProviderById(id));
}
async function createModelProvider(input: ModelProviderInput): Promise<ModelProvider> {
  const row = modelProviderToRow(input);
  if (!row.name) throw new AppError(ErrorCodes.VALIDATION_ERROR, '供应商名称必填', 400);
  return getModelProvider(await repo.insertModelProvider(row));
}
async function updateModelProvider(id: string | number, input: ModelProviderInput): Promise<ModelProvider> {
  const existing = await repo.findModelProviderById(id);
  if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, '供应商不存在', 404);
  await repo.updateModelProvider({ ...modelProviderToRow(input, existing), id: Number(id) });
  return getModelProvider(id);
}
async function deleteModelProvider(id: string | number): Promise<{ ok: boolean }> {
  if (!await repo.findModelProviderById(id)) throw new AppError(ErrorCodes.NOT_FOUND, '供应商不存在', 404);
  if (await repo.countModelsByProviderId(id) > 0) throw new AppError(ErrorCodes.VALIDATION_ERROR, '请先删除该供应商下的模型', 409);
  await repo.deleteModelProviderById(id);
  return { ok: true };
}
interface LegacyModelProviderInput { provider: string; baseUrl?: string; base_url?: string; apiFormat?: string; api_format?: string; apiKey?: string; enabled?: boolean }
async function createLegacyModelProvider(input: LegacyModelProviderInput): Promise<ModelProvider> {
  return createModelProvider({ name: input.provider, baseUrl: input.baseUrl || input.base_url,
    apiFormat: input.apiFormat || input.api_format, apiKey: input.apiKey, enabled: input.enabled });
}

export { listModelProviders, getModelProvider, getRuntimeModelProvider, createModelProvider,
  updateModelProvider, deleteModelProvider, createLegacyModelProvider };
