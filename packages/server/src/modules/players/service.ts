import type { PlayerDto, PlayerInput, PublicPlayerDto } from '@battle/shared';
import type { Selectable } from 'kysely';
import type { PlayersTable } from '../../db/schema';
import { enabledUpdate } from '../../utils/enabled';
import { badRequest, notFound } from '../../utils/errors';
import type { ModelRepository } from '../models/repository';
import type { VoiceRepository } from '../voices/repository';
import type { PlayerRepository } from './repository';

function toDto(row: Selectable<PlayersTable>): PlayerDto {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    persona: row.persona,
    modelId: row.modelId,
    voiceId: row.voiceId,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPublic(row: Selectable<PlayersTable>): PublicPlayerDto {
  return { id: row.id, name: row.name, avatar: row.avatar, persona: row.persona };
}

export function createPlayerService(repository: PlayerRepository, models: ModelRepository, voices: VoiceRepository) {
  async function values(input: PlayerInput) {
    if (!(await models.find(input.modelId))) throw badRequest('模型不存在');
    const voiceId = input.voiceId ?? null;
    if (voiceId !== null && !(await voices.find(voiceId))) throw badRequest('音色不存在');
    return {
      name: input.name,
      avatar: input.avatar ?? null,
      persona: input.persona ?? '',
      modelId: input.modelId,
      voiceId,
    };
  }

  return {
    list: async (): Promise<PlayerDto[]> => (await repository.list()).map(toDto),
    listPublic: async (): Promise<PublicPlayerDto[]> => (await repository.listEnabled()).map(toPublic),
    async get(id: number): Promise<PlayerDto> {
      const row = await repository.find(id);
      if (!row) throw notFound('玩家');
      return toDto(row);
    },
    create: async (input: PlayerInput): Promise<PlayerDto> => toDto(await repository.create({ ...(await values(input)), enabled: input.enabled ?? true })),
    /** 省略 enabled 时保留原值 */
    async update(id: number, input: PlayerInput): Promise<PlayerDto> {
      const row = await repository.update(id, { ...(await values(input)), ...enabledUpdate(input) });
      if (!row) throw notFound('玩家');
      return toDto(row);
    },
    async remove(id: number): Promise<void> {
      const result = await repository.remove(id);
      if (result.numDeletedRows === 0n) throw notFound('玩家');
    },
  };
}

export type PlayerService = ReturnType<typeof createPlayerService>;
