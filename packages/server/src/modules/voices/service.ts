import { VOICE_PROVIDERS, type VoiceDto, type VoiceInput, type VoiceProvider } from '@battle/shared';
import type { Selectable } from 'kysely';
import type { VoicesTable } from '../../db/schema';
import { notFound } from '../../utils/errors';
import type { VoiceRepository } from './repository';

function toProvider(value: string): VoiceProvider {
  return (VOICE_PROVIDERS as readonly string[]).includes(value) ? (value as VoiceProvider) : 'browser';
}

function toDto(row: Selectable<VoicesTable>): VoiceDto {
  return {
    id: row.id,
    name: row.name,
    provider: toProvider(row.provider),
    voiceName: row.voiceName,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createVoiceService(repository: VoiceRepository) {
  const values = (input: VoiceInput) => ({
    name: input.name,
    provider: input.provider,
    voiceName: input.voiceName,
    enabled: input.enabled ?? true,
  });
  return {
    list: async (): Promise<VoiceDto[]> => (await repository.list()).map(toDto),
    async get(id: number): Promise<VoiceDto> {
      const row = await repository.find(id);
      if (!row) throw notFound('音色');
      return toDto(row);
    },
    create: async (input: VoiceInput): Promise<VoiceDto> => toDto(await repository.create(values(input))),
    async update(id: number, input: VoiceInput): Promise<VoiceDto> {
      const row = await repository.update(id, values(input));
      if (!row) throw notFound('音色');
      return toDto(row);
    },
    async remove(id: number): Promise<void> {
      const result = await repository.remove(id);
      if (result.numDeletedRows === 0n) throw notFound('音色');
    },
  };
}

export type VoiceService = ReturnType<typeof createVoiceService>;
