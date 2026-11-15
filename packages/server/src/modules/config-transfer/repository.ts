import { sql } from 'kysely';
import type { Db } from '../../db/database';
import { ConfigTransferError, type ConfigBundle } from './validator';

export async function readConfig(db: Db) {
  return db.transaction().setIsolationLevel('repeatable read').setAccessMode('read only').execute(async tx => {
    // 查询只选配置字段，避免把账号、记忆状态或历史来源关系纳入迁移。
    return {
      providers: await tx.selectFrom('modelProviders').select(['id', 'name', 'baseUrl', 'apiKeyEncrypted', 'apiKeyHint', 'enabled']).orderBy('id').execute(),
      models: (await tx.selectFrom('models').select(['id', 'providerId', 'name', 'model', 'temperature', 'maxTokens',
        'fallbackModelId', 'enabled', 'disabledReason', 'disabledAt']).orderBy('id').execute())
        .map(row => ({ ...row, disabledAt: row.disabledAt?.toISOString() ?? null })),
      voices: await tx.selectFrom('voices').select(['id', 'name', 'provider', 'voiceName', 'language', 'gender',
        'style', 'rate', 'pitch', 'sampleText', 'description', 'enabled']).orderBy('id').execute(),
      players: await tx.selectFrom('players').select(['id', 'name', 'appearanceName', 'avatar', 'persona', 'temperature',
        'maxTokens', 'speechMaxChars', 'modelId', 'voiceId', 'enabled']).orderBy('id').execute(),
      templates: await tx.selectFrom('promptTemplates').selectAll().orderBy('publicationOrder').execute(),
      applied: await tx.selectFrom('appliedPrompts').select(['gameKey', 'variantKey', 'templateName', 'source',
        'persona', 'publicationOrder']).orderBy('publicationOrder').execute(),
      announcements: await tx.selectFrom('announcementTemplates').selectAll().orderBy('gameKey').orderBy('key').execute(),
    };
  });
}

export async function writeConfig(db: Db, data: ConfigBundle) {
  await db.transaction().execute(async tx => {
    // 锁覆盖空表检查和全部写入，阻止后台操作或另一个导入在检查后插入数据。
    await sql`lock table model_providers, models, voices, players, prompt_templates, applied_prompts,
      announcement_templates, matches in access exclusive mode`.execute(tx);
    for (const table of ['modelProviders', 'models', 'voices', 'players', 'promptTemplates',
      'appliedPrompts', 'announcementTemplates', 'matches'] as const) {
      if (await tx.selectFrom(table).select(sql<number>`1`.as('exists')).limit(1).executeTakeFirst()) {
        throw new ConfigTransferError('目标库已有配置或对局，导入已取消。请使用空的目标库。');
      }
    }
    if (data.providers.length) await tx.insertInto('modelProviders').values(data.providers).execute();
    if (data.models.length) {
      await tx.insertInto('models').values(data.models.map(m => ({
        ...m, fallbackModelId: null, disabledAt: m.disabledAt ? new Date(m.disabledAt) : null,
      }))).execute();
      // 备用模型可指向较大的 ID，也可能互相引用，先插入再恢复关联。
      for (const m of data.models) if (m.fallbackModelId !== null) {
        await tx.updateTable('models').set({ fallbackModelId: m.fallbackModelId }).where('id', '=', m.id).execute();
      }
    }
    if (data.voices.length) await tx.insertInto('voices').values(data.voices).execute();
    if (data.players.length) await tx.insertInto('players').values(data.players).execute();
    if (data.templates.length) await tx.insertInto('promptTemplates').values(data.templates).execute();
    if (data.applied.length) await tx.insertInto('appliedPrompts').values(data.applied.map(p => ({
      ...p, comparisonId: 0, // 来源实验属于历史数据，0 表示迁移配置没有对应的线上实验。
    }))).execute();
    if (data.announcements.length) await tx.insertInto('announcementTemplates').values(data.announcements).execute();
    for (const [table, rows] of [
      ['model_providers', data.providers], ['models', data.models], ['voices', data.voices], ['players', data.players],
    ] as const) {
      const next = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
      await sql`alter sequence ${sql.id(table + '_id_seq')} restart with ${sql.lit(next)}`.execute(tx);
    }
    const lastOrder = [...data.templates, ...data.applied].reduce((max, row) =>
      BigInt(row.publicationOrder) > max ? BigInt(row.publicationOrder) : max, 0n);
    // 纯 BigInt 运算产生数值字面量。ALTER SEQUENCE RESTART 可随事务回滚。
    await sql`alter sequence prompt_publication_order restart with ${sql.raw((lastOrder + 1n).toString())}`.execute(tx);
  });
}
