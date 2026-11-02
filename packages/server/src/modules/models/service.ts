import { MODEL_DISABLED_REASONS, type ModelDisabledReason, type ModelDto, type ModelInput, type ModelTestResult } from '@battle/shared';
import type { Selectable } from 'kysely';
import type { ModelsTable } from '../../db/schema';
import { badRequest, notFound } from '../../utils/errors';
import { extractJson, type LlmClient } from '../llm';
import type { ProviderRepository } from '../providers/repository';
import type { ProviderCredentials } from '../providers/service';
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE, TEST_MAX_TOKENS, TEST_PROMPT, TEST_TIMEOUT_MS } from './constants';
import type { ModelRepository } from './repository';

export interface ModelServiceDeps {
  readonly repository: ModelRepository;
  readonly providers: ProviderRepository;
  /** 解密后的供应商连接信息，只用于连接测试 */
  readonly credentials: (providerId: number) => Promise<ProviderCredentials>;
  readonly llm: LlmClient;
}

function toReason(value: string | null): ModelDisabledReason | null {
  return value !== null && (MODEL_DISABLED_REASONS as readonly string[]).includes(value) ? (value as ModelDisabledReason) : null;
}

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
    disabledReason: toReason(row.disabledReason),
    disabledAt: row.disabledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createModelService({ repository, providers, credentials, llm }: ModelServiceDeps) {
  async function assertReferences(input: ModelInput, selfId: number | null): Promise<void> {
    if (!(await providers.find(input.providerId))) throw badRequest('模型供应商不存在');
    const fallback = input.fallbackModelId ?? null;
    if (fallback === null) return;
    if (fallback === selfId) throw badRequest('备用模型不能是自己');
    if (!(await repository.find(fallback))) throw badRequest('备用模型不存在');
  }

  /** 重新启用时清除系统停用原因；管理员停用时保留原因，便于知道之前为何被停用 */
  function values(input: ModelInput, existing: Selectable<ModelsTable> | null) {
    const enabled = input.enabled ?? true;
    return {
      providerId: input.providerId,
      name: input.name,
      model: input.model,
      temperature: input.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      fallbackModelId: input.fallbackModelId ?? null,
      enabled,
      disabledReason: enabled ? null : (existing?.disabledReason ?? null),
      disabledAt: enabled ? null : (existing?.disabledAt ?? null),
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
      return toDto(await repository.create(values(input, null)));
    },

    async update(id: number, input: ModelInput): Promise<ModelDto> {
      const existing = await repository.find(id);
      if (!existing) throw notFound('模型');
      await assertReferences(input, id);
      const row = await repository.update(id, values(input, existing));
      if (!row) throw notFound('模型');
      return toDto(row);
    },

    async remove(id: number): Promise<void> {
      const result = await repository.remove(id);
      if (result.numDeletedRows === 0n) throw notFound('模型');
    },

    /** 连接测试：真实调用一次模型；失败不抛错，原因放在 message 里返回给管理员 */
    async test(id: number): Promise<ModelTestResult> {
      const row = await repository.find(id);
      if (!row) throw notFound('模型');
      const started = Date.now();
      const fail = (message: string): ModelTestResult => ({ ok: false, latencyMs: Date.now() - started, message });
      try {
        const provider = await credentials(row.providerId);
        const response = await llm.complete({
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          model: row.model,
          messages: [{ role: 'user', content: TEST_PROMPT }],
          temperature: 0,
          maxTokens: TEST_MAX_TOKENS,
          timeoutMs: TEST_TIMEOUT_MS,
        });
        const parsed = extractJson(response.content);
        const json = typeof parsed === 'object' && parsed !== null;
        return { ok: true, latencyMs: Date.now() - started, message: json ? '连接成功，JSON 输出正常' : '连接成功，但回复不是 JSON 对象，对局中可能触发兜底' };
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },

    /** 供应商明确返回额度耗尽时由 AI worker 调用：停用并记录原因，管理员补充额度后再手动启用 */
    async markQuotaExhausted(id: number): Promise<void> {
      await repository.update(id, { enabled: false, disabledReason: 'quota_exhausted', disabledAt: new Date() });
    },
  };
}

export type ModelService = ReturnType<typeof createModelService>;
