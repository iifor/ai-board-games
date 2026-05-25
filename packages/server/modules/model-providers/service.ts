import * as repo from './repository';
import { rowToModelProvider, rowToRuntimeModelProvider, modelProviderToRow } from './utils';
import { AppError, ErrorCodes } from '../../utils/errors';
import type { ModelProvider } from '../../types/api';
import type { ModelProviderRow } from '../../types/database';
import type { ModelProviderInput } from './utils';

function listModelProviders(): ModelProvider[] {
  return repo.findAllModelProviders().map((row) => withModelCount(row));
}

function getModelProvider(id: string | number): ModelProvider {
  const provider = withModelCount(repo.findModelProviderById(id));
  if (!provider) throw new AppError(ErrorCodes.NOT_FOUND, '供应商不存在', 404);
  return provider;
}

function getRuntimeModelProvider(id: string | number): ModelProvider | null {
  return rowToRuntimeModelProvider(repo.findModelProviderById(id) as ModelProviderRow & { model_count?: number });
}

function createModelProvider(input: ModelProviderInput): ModelProvider {
  const row = modelProviderToRow(input);
  if (!row.name) throw new AppError(ErrorCodes.VALIDATION_ERROR, '供应商名称必填', 400);
  const id = repo.insertModelProvider(row);
  return getModelProvider(id);
}

function updateModelProvider(id: string | number, input: ModelProviderInput): ModelProvider {
  const existing = repo.findModelProviderById(id);
  if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, '供应商不存在', 404);
  const row = { ...modelProviderToRow(input, existing), id: Number(id) };
  repo.updateModelProvider(row);
  return getModelProvider(id);
}

function deleteModelProvider(id: string | number): { ok: boolean } {
  if (!repo.findModelProviderById(id)) throw new AppError(ErrorCodes.NOT_FOUND, '供应商不存在', 404);
  if (repo.countModelsByProviderId(id) > 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '请先删除该供应商下的模型', 409);
  }
  repo.deleteModelProviderById(id);
  return { ok: true };
}

interface LegacyModelProviderInput {
  provider: string;
  baseUrl?: string;
  base_url?: string;
  apiFormat?: string;
  api_format?: string;
  apiKey?: string;
  enabled?: boolean;
}

function createLegacyModelProvider(input: LegacyModelProviderInput): ModelProvider {
  return createModelProvider({
    name: input.provider,
    baseUrl: input.baseUrl || input.base_url,
    apiFormat: input.apiFormat || input.api_format,
    apiKey: input.apiKey,
    enabled: input.enabled
  });
}

function withModelCount(row: ModelProviderRow | null): ModelProvider | null {
  if (!row) return null;
  return rowToModelProvider({ ...row, model_count: repo.countModelsByProviderId(row.id) });
}

export {
  listModelProviders,
  getModelProvider,
  getRuntimeModelProvider,
  createModelProvider,
  updateModelProvider,
  deleteModelProvider,
  createLegacyModelProvider
};
