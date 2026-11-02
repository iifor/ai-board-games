import type { ProviderDto, ProviderInput } from '@battle/shared';
import type { Selectable } from 'kysely';
import type { ModelProvidersTable } from '../../db/schema';
import { decryptSecret, encryptSecret, maskSecret } from '../../utils/crypto';
import { enabledUpdate } from '../../utils/enabled';
import { badRequest, notFound } from '../../utils/errors';
import type { ProviderRepository } from './repository';

/** 各供应商的模型数，来自模型 repository 的分组统计 */
export type ModelCounter = () => Promise<readonly { readonly providerId: number; readonly count: string | number }[]>;

function toDto(row: Selectable<ModelProvidersTable>, modelCount: number): ProviderDto {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    apiKeyMasked: row.apiKeyHint,
    enabled: row.enabled,
    modelCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 调用模型时使用的供应商连接信息，只在服务端内部流转 */
export interface ProviderCredentials {
  readonly id: number;
  readonly baseUrl: string;
  readonly apiKey: string;
}

export function createProviderService(repository: ProviderRepository, secretKey: Buffer, countModels: ModelCounter) {
  async function counts(): Promise<Map<number, number>> {
    return new Map((await countModels()).map((row) => [row.providerId, Number(row.count)]));
  }

  async function withCount(row: Selectable<ModelProvidersTable>): Promise<ProviderDto> {
    return toDto(row, (await counts()).get(row.id) ?? 0);
  }

  return {
    async list(): Promise<ProviderDto[]> {
      const [rows, countMap] = await Promise.all([repository.list(), counts()]);
      return rows.map((row) => toDto(row, countMap.get(row.id) ?? 0));
    },

    async get(id: number): Promise<ProviderDto> {
      const row = await repository.find(id);
      if (!row) throw notFound('模型供应商');
      return withCount(row);
    },

    async create(input: ProviderInput): Promise<ProviderDto> {
      if (!input.apiKey) throw badRequest('创建供应商时必须提供 API Key');
      const row = await repository.create({
        name: input.name,
        baseUrl: input.baseUrl,
        apiKeyEncrypted: encryptSecret(input.apiKey, secretKey),
        apiKeyHint: maskSecret(input.apiKey),
        enabled: input.enabled ?? true,
      });
      return toDto(row, 0);
    },

    /** 省略 apiKey 或 enabled 时保留原值 */
    async update(id: number, input: ProviderInput): Promise<ProviderDto> {
      const key = input.apiKey ? { apiKeyEncrypted: encryptSecret(input.apiKey, secretKey), apiKeyHint: maskSecret(input.apiKey) } : {};
      const row = await repository.update(id, { name: input.name, baseUrl: input.baseUrl, ...enabledUpdate(input), ...key });
      if (!row) throw notFound('模型供应商');
      return withCount(row);
    },

    async remove(id: number): Promise<void> {
      const result = await repository.remove(id);
      if (result.numDeletedRows === 0n) throw notFound('模型供应商');
    },

    async credentials(id: number): Promise<ProviderCredentials> {
      const row = await repository.find(id);
      if (!row || !row.enabled) throw notFound('可用的模型供应商');
      return { id: row.id, baseUrl: row.baseUrl, apiKey: decryptSecret(row.apiKeyEncrypted, secretKey) };
    },
  };
}

export type ProviderService = ReturnType<typeof createProviderService>;
