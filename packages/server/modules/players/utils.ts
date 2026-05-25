import type { Player } from '../../types/api';
import type { PlayerRow } from '../../types/database';

interface PlayerInput {
  id?: number | string;
  nickname?: string;
  name?: string;
  avatar?: string;
  sex?: string;
  personality?: string;
  provider?: string;
  model?: string;
  modelId?: number | null;
  model_id?: number | null;
  voicePackageId?: number | null;
  voice_package_id?: number | null;
  temperature?: number;
  enabled?: boolean;
  sort_order?: number;
  sortOrder?: number;
}

type PlayerInsertRow = Omit<PlayerRow, 'created_at' | 'updated_at'>;

function playerToRow(input: PlayerInput): PlayerInsertRow {
  return {
    id: Number(input.id),
    nickname: input.nickname || input.name || `${input.id}号`,
    name: input.name || input.nickname || `${input.id}号`,
    avatar: input.avatar || '',
    sex: input.sex || '未知',
    personality: input.personality || '',
    provider: input.provider || 'deepseek',
    model: input.model || 'deepseek-v4-flash',
    model_id: input.modelId != null ? Number(input.modelId) : input.model_id != null ? Number(input.model_id) : null,
    voice_package_id: input.voicePackageId != null ? Number(input.voicePackageId) : input.voice_package_id != null ? Number(input.voice_package_id) : null,
    temperature: Number(input.temperature ?? 0.85),
    enabled: Number(input.enabled !== false),
    sort_order: Number(input.sort_order ?? input.sortOrder ?? input.id ?? 0)
  };
}

function rowToPlayer(row: PlayerRow | null | undefined): Player | null {
  if (!row) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    name: row.name,
    avatar: row.avatar,
    sex: row.sex,
    personality: row.personality,
    provider: row.provider,
    model: row.model,
    modelId: row.model_id,
    voicePackageId: row.voice_package_id,
    temperature: row.temperature,
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export { playerToRow, rowToPlayer };
export type { PlayerInput, PlayerInsertRow };
