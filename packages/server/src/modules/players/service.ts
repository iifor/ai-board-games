import { modelDisplayName, playerPortraitKey, type PlayerDto, type PlayerInput, type PublicPlayerDto } from '@battle/shared';
import { enabledUpdate } from '../../utils/enabled';
import { badRequest, notFound } from '../../utils/errors';
import type { ModelRepository } from '../models/repository';
import type { VoiceRepository } from '../voices/repository';
import type { PlayerRepository, PlayerRow } from './repository';

function boundModelName(row: PlayerRow): string | null {
  return row.modelKey && row.modelName ? modelDisplayName(row.modelName, row.modelKey) : null;
}

function toDto(row: PlayerRow): PlayerDto {
  return {
    id: row.id,
    name: row.name ?? '',
    modelDisplayName: boundModelName(row),
    avatar: row.avatar,
    persona: row.persona,
    temperature: row.temperature,
    maxTokens: row.maxTokens,
    speechMaxChars: row.speechMaxChars,
    modelId: row.modelId,
    voiceId: row.voiceId,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function publicPlayer(row: PlayerRow): PublicPlayerDto {
  return {
    id: row.id, name: boundModelName(row) ?? `玩家 #${row.id}`, avatar: row.avatar, persona: row.persona,
    ...(row.modelKey && { modelKey: row.modelKey }),
    appearanceName: row.appearanceName ?? '#' + row.id,
  };
}

export function createPlayerService(repository: PlayerRepository, models: ModelRepository, voices: VoiceRepository) {
  async function values(input: PlayerInput) {
    if (input.modelId != null && !(await models.find(input.modelId))) throw badRequest('模型不存在');
    const voiceId = input.voiceId ?? null;
    if (voiceId !== null && !(await voices.find(voiceId))) throw badRequest('音色不存在');
    return {
      ...(input.name !== undefined && { name: input.name.trim() || null }),
      ...(input.avatar !== undefined && { avatar: input.avatar }),
      ...(input.persona !== undefined && { persona: input.persona }),
      ...(input.temperature !== undefined && { temperature: input.temperature }),
      ...(input.maxTokens !== undefined && { maxTokens: input.maxTokens }),
      ...(input.speechMaxChars !== undefined && { speechMaxChars: input.speechMaxChars }),
      ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
      ...(input.voiceId !== undefined && { voiceId }),
    };
  }

  return {
    list: async (): Promise<PlayerDto[]> => (await repository.list()).map(toDto),
    listPublic: async (): Promise<PublicPlayerDto[]> => (await repository.listPlayable()).map(publicPlayer),
    async get(id: number): Promise<PlayerDto> {
      const row = await repository.find(id);
      if (!row) throw notFound('玩家');
      return toDto(row);
    },
    create: async (input: PlayerInput): Promise<PlayerDto> => toDto(await repository.create({
      persona: '', appearanceName: playerPortraitKey(input.name ?? ''), ...(await values(input)), enabled: input.enabled ?? true,
    })),
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
