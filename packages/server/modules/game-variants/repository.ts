import { getDbExecutor } from '../../db';
import type { DbExecutor } from '../../db/types';
import type { GameVariant, GameVariantInput, GameVariantUpdate } from './types';

interface VariantRow {
  id: number;
  game_type: string;
  variant_key: string;
  definition_version: string;
  name: string;
  description: string;
  config_schema_version: number;
  config_json: Record<string, unknown>;
  enabled: boolean;
  sort_order: number;
  revision: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: VariantRow): GameVariant {
  return {
    id: Number(row.id),
    gameType: row.game_type,
    variantKey: row.variant_key,
    definitionVersion: row.definition_version,
    name: row.name,
    description: row.description,
    configSchemaVersion: row.config_schema_version,
    config: row.config_json,
    enabled: row.enabled,
    sortOrder: row.sort_order,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listVariants(gameType?: string, includeDisabled = false): Promise<GameVariant[]> {
  const rows = await getDbExecutor().queryMany<VariantRow>(`SELECT * FROM game_variants
    WHERE ($1::text IS NULL OR game_type = $1) AND ($2::boolean OR enabled = true)
    ORDER BY game_type, sort_order, variant_key`, [gameType || null, includeDisabled]);
  return rows.map(mapRow);
}

async function findVariantById(id: number, db: DbExecutor = getDbExecutor(), lock = false): Promise<GameVariant | null> {
  const row = await db.queryOne<VariantRow>(`SELECT * FROM game_variants WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  return row ? mapRow(row) : null;
}

async function findEnabledVariant(gameType: string, variantKey: string): Promise<GameVariant | null> {
  const row = await getDbExecutor().queryOne<VariantRow>(`SELECT * FROM game_variants
    WHERE game_type = $1 AND variant_key = $2 AND enabled = true`, [gameType, variantKey]);
  return row ? mapRow(row) : null;
}

async function createVariant(input: GameVariantInput, db: DbExecutor): Promise<GameVariant> {
  const row = await db.queryOne<VariantRow>(`INSERT INTO game_variants
    (game_type, variant_key, definition_version, name, description, config_schema_version,
     config_json, enabled, sort_order)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [input.gameType, input.variantKey,
    input.definitionVersion, input.name, input.description || '', input.configSchemaVersion || 1,
    input.config || {}, input.enabled ?? true, input.sortOrder || 0]);
  if (!row) throw new Error('Game variant insert returned no row');
  return mapRow(row);
}

async function updateVariant(id: number, input: GameVariantUpdate, db: DbExecutor): Promise<GameVariant | null> {
  const row = await db.queryOne<VariantRow>(`UPDATE game_variants SET
    game_type = COALESCE($3, game_type), variant_key = COALESCE($4, variant_key),
    definition_version = COALESCE($5, definition_version), name = COALESCE($6, name),
    description = COALESCE($7, description), config_schema_version = COALESCE($8, config_schema_version),
    config_json = COALESCE($9, config_json), enabled = COALESCE($10, enabled),
    sort_order = COALESCE($11, sort_order), revision = revision + 1, updated_at = now()
    WHERE id = $1 AND revision = $2 RETURNING *`, [id, input.revision, input.gameType ?? null,
    input.variantKey ?? null, input.definitionVersion ?? null, input.name ?? null,
    input.description ?? null, input.configSchemaVersion ?? null, input.config ?? null,
    input.enabled ?? null, input.sortOrder ?? null]);
  return row ? mapRow(row) : null;
}

export { listVariants, findVariantById, findEnabledVariant, createVariant, updateVariant };
