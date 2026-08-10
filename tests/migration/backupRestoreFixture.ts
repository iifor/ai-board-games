import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { buildManifest, type BackupManifest } from '../../packages/db-migrator/src/backup/manifest';

export interface BackupFixture {
  temporary: string;
  root: string;
  manifestPath: string;
  output: string;
  longRelativePath: string;
}

export async function writeManifest(root: string, runId: string): Promise<string> {
  const manifest = await buildManifest(root, runId);
  const manifestPath = path.join(root, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return manifestPath;
}

export async function replaceManifest(root: string, mutate?: (manifest: BackupManifest) => void): Promise<string> {
  const manifestPath = path.join(root, 'manifest.json');
  await fs.rm(manifestPath);
  const manifest = await buildManifest(root, 'backup-fixture');
  mutate?.(manifest);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return manifestPath;
}

export async function readManifest(manifestPath: string): Promise<BackupManifest> {
  return JSON.parse(await fs.readFile(manifestPath, 'utf8')) as BackupManifest;
}

export async function createBackupFixture(t: TestContext, resourceRoots = 2): Promise<BackupFixture> {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-restore-commands-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'backup');
  const output = path.join(temporary, 'evidence');
  await fs.mkdir(path.join(root, 'sqlite-raw'), { recursive: true });
  const source = path.join(root, 'sqlite-raw', 'source.sqlite');
  const sqlite = new Database(source);
  sqlite.exec(`
    CREATE TABLE games (id TEXT PRIMARY KEY);
    INSERT INTO games VALUES ('game-1');
    CREATE TABLE players (id TEXT PRIMARY KEY);
    INSERT INTO players VALUES ('player-1');
    CREATE TABLE admin_users (id INTEGER PRIMARY KEY);
    INSERT INTO admin_users VALUES (1);
    CREATE TABLE game_playback_events (id TEXT PRIMARY KEY);
    INSERT INTO game_playback_events VALUES ('event-1');
    CREATE TABLE player_game_memories (id INTEGER PRIMARY KEY);
    INSERT INTO player_game_memories VALUES (1);
  `);
  sqlite.close();
  await fs.copyFile(source, path.join(root, 'sqlite-consistent.sqlite'));

  let longDirectory = path.join(root, 'resources', 'resource-000');
  while (path.join(longDirectory, 'payload.json').length < 296) {
    longDirectory = path.join(longDirectory, `segment-${'x'.repeat(28)}`);
  }
  await fs.mkdir(longDirectory, { recursive: true });
  const longFile = path.join(longDirectory, 'payload.json');
  await fs.writeFile(longFile, '{"long":true}\n');
  for (let index = 1; index < resourceRoots; index += 1) {
    const candidate = path.join(root, 'resources', `resource-${String(index).padStart(3, '0')}`, 'asset.txt');
    await fs.mkdir(path.dirname(candidate), { recursive: true });
    await fs.writeFile(candidate, `resource-${index}\n`);
  }
  const manifestPath = await writeManifest(root, 'backup-fixture');
  return {
    temporary,
    root,
    manifestPath,
    output,
    longRelativePath: path.relative(root, longFile).split(path.sep).join('/'),
  };
}
