import type { ModelDto, ModelInput } from '@battle/shared';
import type { Selectable } from 'kysely';
import type { ModelsTable } from '../../db/schema';
import { badRequest, notFound } from '../../utils/errors';
import type { ProviderRepository } from '../providers/repository';
import type { ModelRepository } from './repository';

const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 1024;

function toDto(row: Selectable<ModelsTable>): ModelDto {
  return {
    id: row.id,
    providerId: row.providerId,
    name: row.name,
    model: row.model,
    temperature: row.temperature,
    maxTokens: row.maxTokens,
    fallbackModelId: row.fallbackModelId,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createModelService(repository: ModelRepository, providers: ProviderRepository) {
  async function assertReferences(input: ModelInput, selfId: number | null): Promise<void> {
    if (!(await providers.find(input.providerId))) throw badRequest('模型供应商不存在');
    const fallback = input.fallbackModelId ?? null;
    if (fallback === null) return;
    if (fallback === selfId) throw badRequest('备用模型不能是自己');
    if (!(await repository.find(fallback))) throw badRequest('备用模型不存在');
  }

  function values(input: ModelInput) {
    return {
      providerId: input.providerId,
      name: input.name,
      model: input.model,
      temperature: input.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      fallbackModelId: input.fallbackModelId ?? null,
      enabled: input.enabled ?? true,
    };
  }

  return {
    list: async (): Promise<ModelDto[]> => (await repository.list()).map(toDto),

    async get(id: number): Promise<ModelDto> {
      const row = await repository.find(id);
      if (!row) throw notFound('模型');
      return toDto(row);
    },

    async create(input: ModelInput): Promise<ModelDto> {
      await assertReferences(input, null);
      return toDto(await repository.create(values(input)));
    },

    async update(id: number, input: ModelInput): Promise<ModelDto> {
      await assertReferences(input, id);
      const row = await repository.update(id, values(input));
      if (!row) throw notFound('模型');
      return toDto(row);
    },

    async remove(id: number): Promise<void> {
      const result = await repository.remove(id);
      if (result.numDeletedRows === 0n) throw notFound('模型');
    },
  };
}

export type ModelService = ReturnType<typeof createModelService>;
