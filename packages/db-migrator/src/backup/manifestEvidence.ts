import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  captureStableFile,
  captureStableFileContent,
  type StableFile,
  type StableFileContent,
} from './fileSnapshot';
import type { BackupManifest, ManifestEntry } from './manifest';
import { isSafeRunId } from './publication';

const SHA256 = /^[a-f0-9]{64}$/;

export interface VerifiedBackup {
  root: string;
  rootRealPath: string;
  manifestPath: string;
  manifest: BackupManifest;
  manifestFile: StableFileContent;
  files: Map<string, StableFile>;
}

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function fail(code: string): never {
  throw codedError(code, 'Backup evidence verification failed');
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function safeManifestPath(candidate: unknown): candidate is string {
  return typeof candidate === 'string' && Boolean(candidate) && !candidate.includes('\\')
    && !path.posix.isAbsolute(candidate) && path.posix.normalize(candidate) === candidate
    && candidate !== '..' && !candidate.startsWith('../') && candidate !== 'manifest.json';
}

function validEntry(value: unknown): value is ManifestEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<ManifestEntry>;
  return safeManifestPath(entry.path) && Number.isSafeInteger(entry.sizeBytes) && Number(entry.sizeBytes) >= 0
    && typeof entry.sha256 === 'string' && SHA256.test(entry.sha256);
}

function parseManifest(bytes: Buffer): BackupManifest {
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { fail('BACKUP_MANIFEST_INVALID'); }
  if (!value || typeof value !== 'object') fail('BACKUP_MANIFEST_INVALID');
  const manifest = value as Partial<BackupManifest>;
  if (manifest.version !== 1 || typeof manifest.runId !== 'string' || !isSafeRunId(manifest.runId)
    || typeof manifest.createdAt !== 'string' || !Number.isFinite(Date.parse(manifest.createdAt))
    || typeof manifest.sourceDatabaseSha256 !== 'string' || !SHA256.test(manifest.sourceDatabaseSha256)
    || typeof manifest.consistentDatabaseSha256 !== 'string' || !SHA256.test(manifest.consistentDatabaseSha256)
    || !Array.isArray(manifest.entries) || !manifest.entries.every(validEntry)) {
    fail('BACKUP_MANIFEST_INVALID');
  }
  const entries = manifest.entries as ManifestEntry[];
  const exact = new Set<string>();
  const aliases = new Set<string>();
  for (const entry of entries) {
    const alias = entry.path.toLowerCase();
    if (exact.has(entry.path) || aliases.has(alias)) fail('BACKUP_MANIFEST_DUPLICATE_PATH');
    exact.add(entry.path);
    aliases.add(alias);
  }
  const sorted = entries.map((entry) => entry.path).sort();
  if (entries.some((entry, index) => entry.path !== sorted[index])) fail('BACKUP_MANIFEST_INVALID');
  const source = entries.find((entry) => entry.path === 'sqlite-raw/source.sqlite');
  const consistent = entries.find((entry) => entry.path === 'sqlite-consistent.sqlite');
  if (!source || !consistent || source.sha256 !== manifest.sourceDatabaseSha256
    || consistent.sha256 !== manifest.consistentDatabaseSha256) fail('BACKUP_MANIFEST_INVALID');
  return manifest as BackupManifest;
}

async function listBackupFiles(root: string, rootRealPath: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const directoryStats = await fs.lstat(directory);
    if (directoryStats.isSymbolicLink() || !directoryStats.isDirectory()) fail('BACKUP_PATH_INVALID');
    const realDirectory = await fs.realpath(directory);
    if (!isInside(rootRealPath, realDirectory)) fail('BACKUP_PATH_INVALID');
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      const stats = await fs.lstat(candidate);
      if (stats.isSymbolicLink()) fail('BACKUP_PATH_INVALID');
      if (stats.isDirectory()) await visit(candidate);
      else if (stats.isFile()) {
        const relative = path.relative(root, candidate).split(path.sep).join('/');
        if (relative !== 'manifest.json') files.push(relative);
      } else fail('BACKUP_PATH_INVALID');
    }
  };
  await visit(root);
  return files.sort();
}

function sameStableFile(left: StableFile, right: StableFile): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.sizeBytes === right.sizeBytes
    && left.mtimeNs === right.mtimeNs && left.realPath === right.realPath && left.sha256 === right.sha256;
}

export async function verifyPublishedBackup(backupDirectory: string, manifestPath: string): Promise<VerifiedBackup> {
  try {
    const root = path.resolve(backupDirectory);
    const expectedManifestPath = path.join(root, 'manifest.json');
    if (path.resolve(manifestPath) !== expectedManifestPath) fail('BACKUP_MANIFEST_PATH_INVALID');
    const rootStats = await fs.lstat(root, { bigint: true });
    if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) fail('BACKUP_PATH_INVALID');
    const rootRealPath = await fs.realpath(root);
    const manifestFile = await captureStableFileContent(
      expectedManifestPath,
      rootRealPath,
      'manifest.json',
      'BACKUP_EVIDENCE_CHANGED',
    );
    const manifest = parseManifest(manifestFile.bytes);
    const actualPaths = await listBackupFiles(root, rootRealPath);
    if (actualPaths.length !== manifest.entries.length
      || actualPaths.some((candidate, index) => candidate !== manifest.entries[index].path)) {
      fail('BACKUP_FILESET_MISMATCH');
    }
    const files = new Map<string, StableFile>();
    for (const entry of manifest.entries) {
      const candidate = path.join(root, ...entry.path.split('/'));
      const captured = await captureStableFile(candidate, rootRealPath, entry.path, 'BACKUP_EVIDENCE_CHANGED');
      if (captured.sizeBytes !== entry.sizeBytes || captured.sha256 !== entry.sha256) fail('BACKUP_CONTENT_MISMATCH');
      files.set(entry.path, captured);
    }
    const finalManifest = await captureStableFile(
      expectedManifestPath,
      rootRealPath,
      'manifest.json',
      'BACKUP_EVIDENCE_CHANGED',
    );
    const finalRootStats = await fs.lstat(root, { bigint: true });
    if (!sameStableFile(manifestFile, finalManifest) || finalRootStats.dev !== rootStats.dev
      || finalRootStats.ino !== rootStats.ino || await fs.realpath(root) !== rootRealPath) {
      fail('BACKUP_EVIDENCE_CHANGED');
    }
    return { root, rootRealPath, manifestPath: expectedManifestPath, manifest, manifestFile, files };
  } catch (error) {
    if ((error as Error & { code?: string }).code?.startsWith('BACKUP_')) throw error;
    fail('BACKUP_VERIFY_FAILED');
  }
}
