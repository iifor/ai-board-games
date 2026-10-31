import type { ProviderDto, ProviderInput } from '@battle/shared';
import type { Selectable } from 'kysely';
import type { ModelProvidersTable } from '../../db/schema';
import { decryptSecret, encryptSecret, maskSecret } from '../../utils/crypto';
import { badRequest, notFound } from '../../utils/errors';
import type { ProviderRepository } from './repository';

function toDto(row: Selectable<ModelProvidersTable>): ProviderDto {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    apiKeyMasked: row.apiKeyHint,
    enabled: row.enabled,
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

export function createProviderService(repository: ProviderRepository, secretKey: Buffer) {
  return {
    list: async (): Promise<ProviderDto[]> => (await repository.list()).map(toDto),

    async get(id: number): Promise<ProviderDto> {
      const row = await repository.find(id);
      if (!row) throw notFound('模型供应商');
      return toDto(row);
    },

    async create(input: ProviderInput): Promise<ProviderDto> {
      if (!input.apiKey) throw badRequest('创建供应商时必须提供 API Key');
      return toDto(await repository.create({
        name: input.name,
        baseUrl: input.baseUrl,
        apiKeyEncrypted: encryptSecret(input.apiKey, secretKey),
        apiKeyHint: maskSecret(input.apiKey),
        enabled: input.enabled ?? true,
      }));
    },

    async update(id: number, input: ProviderInput): Promise<ProviderDto> {
      const key = input.apiKey ? { apiKeyEncrypted: encryptSecret(input.apiKey, secretKey), apiKeyHint: maskSecret(input.apiKey) } : {};
      const row = await repository.update(id, { name: input.name, baseUrl: input.baseUrl, enabled: input.enabled ?? true, ...key });
      if (!row) throw notFound('模型供应商');
      return toDto(row);
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
