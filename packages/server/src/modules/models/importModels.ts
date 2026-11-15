import { DEFAULT_MODEL_MAX_TOKENS, type ModelImportResult } from '@battle/shared';
import { sql } from 'kysely';
import type { Db } from '../../db/database';
import { notFound } from '../../utils/errors';

function displayName(model: string, provider: string, names: ReadonlySet<string>): string {
  const plain = model.slice(0, 64);
  if (!names.has(plain)) return plain;
  const prefix = provider.slice(0, 24) + ' / ';
  for (let attempt = 1; ; attempt++) {
    const suffix = attempt === 1 ? '' : ` (${attempt})`;
    const candidate = prefix + model.slice(0, 64 - prefix.length - suffix.length) + suffix;
    if (!names.has(candidate)) return candidate;
  }
}

export function importProviderModels(db: Db, providerId: number, modelIds: readonly string[]): Promise<ModelImportResult> {
  return db.transaction().execute(async (trx) => {
    const provider = await trx.selectFrom('modelProviders').select('name').where('id', '=', providerId).forKeyShare().executeTakeFirst();
    if (!provider) throw notFound('模型供应商');
    // 展示名全局唯一。与手工增删改串行，在一次短事务中检查已有模型、分配名称、写入。
    await sql`lock table models in share row exclusive mode`.execute(trx);
    const existing = await trx.selectFrom('models').select(['name', 'model', 'providerId']).execute();
    const names = new Set(existing.map(row => row.name));
    const bound = new Set(existing.filter(row => row.providerId === providerId).map(row => row.model));
    const ids = [...new Set(modelIds)];
    const rows = ids.filter(model => !bound.has(model)).map(model => {
      const name = displayName(model, provider.name, names);
      names.add(name);
      return { providerId, model, name, maxTokens: DEFAULT_MODEL_MAX_TOKENS,
        fallbackModelId: null, enabled: true, disabledReason: null, disabledAt: null };
    });
    if (rows.length) await trx.insertInto('models').values(rows).execute();
    return { created: rows.length, skipped: ids.length - rows.length };
  });
}
