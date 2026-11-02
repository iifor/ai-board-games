import {
  VOICE_GENDERS, VOICE_PROVIDERS,
  type VoiceDto, type VoiceGender, type VoiceImportResult, type VoiceInput, type VoicePreviewResult, type VoiceProvider,
} from '@battle/shared';
import type { Selectable } from 'kysely';
import type { VoicesTable } from '../../db/schema';
import { enabledUpdate } from '../../utils/enabled';
import { notFound } from '../../utils/errors';
import type { TtsService } from '../tts';
import { DEFAULT_VOICES } from './catalog';
import { DEFAULT_LANGUAGE, DEFAULT_PERCENT, DEFAULT_SAMPLE_TEXT } from './constants';
import type { VoiceRepository } from './repository';

function toProvider(value: string): VoiceProvider {
  return (VOICE_PROVIDERS as readonly string[]).includes(value) ? (value as VoiceProvider) : 'browser';
}

function toGender(value: string | null): VoiceGender | null {
  return value !== null && (VOICE_GENDERS as readonly string[]).includes(value) ? (value as VoiceGender) : null;
}

function toDto(row: Selectable<VoicesTable>): VoiceDto {
  return {
    id: row.id,
    name: row.name,
    provider: toProvider(row.provider),
    voiceName: row.voiceName,
    language: row.language,
    gender: toGender(row.gender),
    style: row.style,
    rate: row.rate,
    pitch: row.pitch,
    sampleText: row.sampleText,
    description: row.description,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 导入目录时的去重依据：同一来源、同一音色、同一风格视为同一条 */
function signature(voice: { readonly provider: string; readonly voiceName: string; readonly style?: string | undefined }): string {
  return `${voice.provider}|${voice.voiceName.toLowerCase()}|${voice.style ?? ''}`;
}

export function createVoiceService(repository: VoiceRepository, tts: Pick<TtsService, 'synthesize'>) {
  const values = (input: VoiceInput) => ({
    name: input.name,
    provider: input.provider,
    voiceName: input.voiceName,
    language: input.language ?? DEFAULT_LANGUAGE,
    gender: input.gender ?? null,
    style: input.style ?? '',
    rate: input.rate ?? DEFAULT_PERCENT,
    pitch: input.pitch ?? DEFAULT_PERCENT,
    sampleText: input.sampleText ?? '',
    description: input.description ?? '',
  });

  return {
    list: async (): Promise<VoiceDto[]> => (await repository.list()).map(toDto),

    async get(id: number): Promise<VoiceDto> {
      const row = await repository.find(id);
      if (!row) throw notFound('音色');
      return toDto(row);
    },

    create: async (input: VoiceInput): Promise<VoiceDto> => toDto(await repository.create({ ...values(input), enabled: input.enabled ?? true })),

    /** 省略 enabled 时保留原值 */
    async update(id: number, input: VoiceInput): Promise<VoiceDto> {
      const row = await repository.update(id, { ...values(input), ...enabledUpdate(input) });
      if (!row) throw notFound('音色');
      return toDto(row);
    },

    async remove(id: number): Promise<void> {
      const result = await repository.remove(id);
      if (result.numDeletedRows === 0n) throw notFound('音色');
    },

    /** 试听：合成一段文本并返回与对局播放共用的音频地址；浏览器音色由前端自己朗读 */
    async preview(id: number, text?: string): Promise<VoicePreviewResult> {
      const row = await repository.find(id);
      if (!row) throw notFound('音色');
      const content = text?.trim() || row.sampleText || DEFAULT_SAMPLE_TEXT;
      return tts.synthesize(content, {
        provider: toProvider(row.provider),
        voiceName: row.voiceName,
        language: row.language,
        style: row.style,
        rate: row.rate,
        pitch: row.pitch,
      });
    },

    /** 导入内置音色目录：已存在（同来源、音色、风格）或重名的跳过，可重复执行 */
    async importDefaults(): Promise<VoiceImportResult> {
      const existing = await repository.list();
      const signatures = new Set(existing.map(signature));
      const names = new Set(existing.map((row) => row.name));
      let created = 0;
      for (const voice of DEFAULT_VOICES) {
        if (signatures.has(signature(voice)) || names.has(voice.name)) continue;
        await repository.create({ ...values(voice), enabled: true });
        signatures.add(signature(voice));
        names.add(voice.name);
        created += 1;
      }
      return { created, skipped: DEFAULT_VOICES.length - created };
    },
  };
}

export type VoiceService = ReturnType<typeof createVoiceService>;
