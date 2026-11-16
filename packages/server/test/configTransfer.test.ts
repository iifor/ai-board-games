import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { sql } from 'kysely';
import { expect, it } from 'vitest';
import { gameRegistry } from '@battle/games';
import { decryptSecret, encryptSecret } from '../src/utils/crypto';
import { decodeConfig, exportConfig, importConfig } from '../src/modules/config-transfer/service';
import { readConfig } from '../src/modules/config-transfer/repository';
import { readMatchPrompts } from '../src/modules/prompt-catalog/settingsRepository';
import { seedPlayers } from './support/fixtures';
import { createTestApp } from './support/testApp';
import { createDatabase } from '../src/db/database';

it('round-trips only configuration, re-encrypts keys, keeps bindings and publication priority, and restores sequences', async () => {
  const source = await createTestApp();
  const target = await createTestApp();
  try {
    const ids = await seedPlayers(source, 9);
    const owner = ids[0]!;
    await source.services.players.update(owner, { persona: '迁移玩家人设', temperature: 0.3, maxTokens: 2048, speechMaxChars: 180 });
    // 较大的、非连续 ID，以及正向引用和循环备用模型都必须保留。
    const extra = await source.services.models.create({
      providerId: 1, name: '迁移备用', model: 'extra', maxTokens: 8192, fallbackModelId: 2,
    });
    await source.db.updateTable('models').set({ id: 100 }).where('id', '=', extra.id).execute();
    await source.db.updateTable('models').set({ fallbackModelId: 100 }).where('id', '=', 2).execute();
    await source.db.updateTable('models').set({ enabled: false, disabledReason: 'quota_exhausted', disabledAt: new Date('2026-01-01T00:00:00Z') })
      .where('id', '=', 100).execute();
    const extraVoice = await source.services.voices.create({ name: '未绑定音色', provider: 'browser', voiceName: 'zh-CN-Test' });
    await source.db.updateTable('voices').set({ id: 50 }).where('id', '=', extraVoice.id).execute();
    await source.db.insertInto('promptTemplates').values([
      { gameKey: 'werewolf', templateName: 'wolfChat', source: '目录旧版', revision: 3, publicationOrder: '8' },
      { gameKey: 'werewolf', templateName: 'wolfKill', source: '目录新版', revision: 4, publicationOrder: '13' },
      { gameKey: 'system', templateName: 'playerExpression', source: '迁移表达', revision: 1, publicationOrder: '14' },
    ]).execute();
    await source.db.insertInto('appliedPrompts').values([
      { gameKey: 'werewolf', variantKey: 'wolf-beauty-guard-12', templateName: 'wolfChat', source: '板子新版',
        persona: '板子人设', comparisonId: 99, publicationOrder: '10' },
      { gameKey: 'werewolf', variantKey: 'wolf-beauty-guard-12', templateName: 'wolfKill', source: '板子旧版',
        persona: null, comparisonId: 98, publicationOrder: '12' },
    ]).execute();
    await source.db.insertInto('announcementTemplates').values({
      gameKey: 'werewolf', key: 'nightFalls', customText: '迁移叫号', revision: 2,
    }).execute();
    const match = await source.services.matches.createPublic({ gameKey: 'debate', playerIds: ids }, (await source.access()).grant);
    await source.db.insertInto('playerMemories').values({
      ownerId: owner, matchId: match.id, gameKey: 'debate', content: '历史记忆不迁移',
      subjectId: null, subjectName: null, phaseId: null, action: null, evidence: '[]',
      requestId: null, previousId: null, outcome: 'unresolved',
    }).execute();

    const bundle = await exportConfig(source.db, source.config.secretKey);
    expect(bundle.content).not.toContain('sk-test');
    expect(bundle.content).not.toContain('迁移玩家人设');
    const decoded = decodeConfig(bundle.content, source.config.secretKey);
    expect(decoded).not.toHaveProperty('matches');
    expect(decoded).not.toHaveProperty('adminUsers');
    expect(decoded.players[0]).not.toHaveProperty('memoryGeneration');
    expect(decoded.applied[0]).not.toHaveProperty('comparisonId');
    expect(() => decodeConfig(bundle.content, randomBytes(32))).toThrow('无法解密');
    expect(() => decodeConfig(bundle.content.replace('AT-ODDS-CONFIG-1', 'AT-ODDS-CONFIG-2'), source.config.secretKey)).toThrow('版本');

    // 在部分表已写入后触发唯一约束，验证整个事务回滚。
    const invalid = { ...decoded, voices: [...decoded.voices, { ...decoded.voices[0]!, id: 90 }] };
    const bad = 'AT-ODDS-CONFIG-1\n' + encryptSecret(JSON.stringify(invalid), source.config.secretKey);
    await expect(importConfig(target.db, bad, source.config.secretKey, target.config.secretKey)).rejects.toThrow();
    expect(await target.db.selectFrom('models').select('id').execute()).toEqual([]);
    expect(await target.db.selectFrom('modelProviders').select('id').execute()).toEqual([]);

    await importConfig(target.db, bundle.content, source.config.secretKey, target.config.secretKey);
    const migrated = await readConfig(target.db);
    expect(migrated.players).toEqual(decoded.players);
    expect(migrated.models).toEqual(decoded.models);
    expect(migrated.voices).toEqual(decoded.voices);
    expect(migrated.templates).toEqual(decoded.templates);
    expect(migrated.applied).toEqual(decoded.applied);
    expect(migrated.announcements).toEqual(decoded.announcements);
    const provider = migrated.providers[0]!;
    expect(decryptSecret(provider.apiKeyEncrypted, target.config.secretKey)).toBe('sk-test');
    expect(() => decryptSecret(provider.apiKeyEncrypted, source.config.secretKey)).toThrow();
    expect(await target.services.providers.credentials(provider.id)).toMatchObject({ apiKey: 'sk-test' });

    for (const table of ['matches', 'matchSeats', 'aiTasks', 'aiCalls', 'matchStageEvents', 'playerMemories',
      'playerDecisions', 'playerMemoryReviews', 'promptComparisons', 'replayImports', 'mediaAssets'] as const) {
      expect(await target.db.selectFrom(table).select(sql<number>`count(*)::int`.as('n')).executeTakeFirst()).toEqual({ n: 0 });
    }
    expect(await target.db.selectFrom('adminUsers').select('username').execute()).toEqual([{ username: 'admin' }]);
    const effective = await readMatchPrompts(target.db, gameRegistry.get('werewolf')!, 'wolf-beauty-guard-12');
    expect(effective.promptSet.trials.wolfChat).toEqual({ source: '板子新版', persona: '板子人设' });
    expect(effective.promptSet.sources.wolfKill).toBe('目录新版');
    expect(effective.promptSet.trials).not.toHaveProperty('wolfKill');
    expect(effective.promptSet.playerExpression).toBe('迁移表达');
    expect(effective.announcementOverrides).toEqual({ nightFalls: '迁移叫号' });

    await expect(importConfig(target.db, bundle.content, source.config.secretKey, target.config.secretKey)).rejects.toThrow('已有配置');
    expect((await readConfig(target.db)).players).toEqual(decoded.players);
    const next = await target.services.models.create({ providerId: 1, name: '新模型', model: 'new' });
    expect(next.id).toBe(101);
    const nextVoice = await target.services.voices.create({ name: '新音色', provider: 'azure', voiceName: 'new' });
    expect(nextVoice.id).toBe(51);
    const nextPrompt = await target.db.insertInto('promptTemplates').values({
      gameKey: 'system', templateName: 'platform', source: '新提示词', revision: 1,
    }).returning('publicationOrder').executeTakeFirstOrThrow();
    expect(nextPrompt.publicationOrder).toBe('15');
  } finally {
    await target.cleanup();
    await source.cleanup();
  }
}, 60_000);

it('runs CLI export and import against an uninitialized schema without starting the application', async () => {
  const source = await createTestApp();
  const schema = 'test_transfer_' + randomBytes(6).toString('hex');
  const target = createDatabase({ ...source.config.database, schema });
  const tmpRoot = fileURLToPath(new URL('../../../tmp/', import.meta.url));
  await mkdir(tmpRoot, { recursive: true });
  const directory = await mkdtemp(resolve(tmpRoot, 'config-transfer-'));
  const file = resolve(directory, 'config.enc');
  const cli = fileURLToPath(new URL('../src/commands/config-transfer.ts', import.meta.url));
  const tsx = fileURLToPath(import.meta.resolve('tsx/cli'));
  const execute = promisify(execFile);
  const env = { ...process.env, DATABASE_URL: source.config.database.url,
    DATABASE_SCHEMA: source.schema, SECRET_KEY: source.config.secretKey.toString('base64') };
  try {
    await seedPlayers(source, 1);
    const exported = await execute(process.execPath, [tsx, cli, 'export', '--file', file], { env });
    expect(exported.stdout).toContain('配置导出完成');
    expect(await readFile(file, 'utf8')).not.toContain('sk-test');
    await expect(execute(process.execPath, [tsx, cli, 'export', '--file', file], { env })).rejects.toMatchObject({
      stderr: expect.stringContaining('文件已存在'),
    });
    const targetKey = randomBytes(32);
    const imported = await execute(process.execPath, [tsx, cli, 'import', '--file', file], {
      env: { ...env, DATABASE_SCHEMA: schema, SECRET_KEY: targetKey.toString('base64'), CONFIG_SOURCE_SECRET_KEY: env.SECRET_KEY },
    });
    expect(imported.stdout).toContain('配置导入完成');
    const rows = await sql<{ n: number }>`select count(*)::int as n from ${sql.id(schema, 'players')}`.execute(target);
    expect(rows.rows).toEqual([{ n: 1 }]);
    const providers = await sql<{ apiKeyEncrypted: string }>`select api_key_encrypted from ${sql.id(schema, 'model_providers')}`.execute(target);
    expect(decryptSecret(providers.rows[0]!.apiKeyEncrypted, targetKey)).toBe('sk-test');
  } finally {
    await sql`drop schema if exists ${sql.id(schema)} cascade`.execute(target);
    await target.destroy();
    await source.cleanup();
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

it('serializes concurrent imports and rejects broken references before writing', async () => {
  const source = await createTestApp();
  const target = await createTestApp();
  try {
    await seedPlayers(source, 1);
    const bundle = await exportConfig(source.db, source.config.secretKey);
    const data = decodeConfig(bundle.content, source.config.secretKey);
    data.players[0]!.modelId = 9999;
    const bad = 'AT-ODDS-CONFIG-1\n' + encryptSecret(JSON.stringify(data), source.config.secretKey);
    await expect(importConfig(target.db, bad, source.config.secretKey, target.config.secretKey)).rejects.toThrow();
    expect(await target.db.selectFrom('players').select('id').execute()).toEqual([]);
    const results = await Promise.allSettled([
      importConfig(target.db, bundle.content, source.config.secretKey, target.config.secretKey),
      importConfig(target.db, bundle.content, source.config.secretKey, target.config.secretKey),
    ]);
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await target.db.selectFrom('players').select('id').execute()).toHaveLength(1);
  } finally {
    await target.cleanup();
    await source.cleanup();
  }
}, 60_000);
