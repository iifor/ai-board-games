import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';

export interface ManifestEntry {
  path: string;
  sizeBytes: number;
  sha256: string;
}

export interface BackupManifest {
  version: 1;
  runId: string;
  createdAt: string;
  sourceDatabaseSha256: string;
  consistentDatabaseSha256: string;
  entries: ManifestEntry[];
}

export async function hashFile(candidate: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const input = createReadStream(candidate);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

function normalizedRelative(root: string, candidate: string): string {
  const relative = path.relative(root, candidate);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Artifact escapes backup root: ${relative || '.'}`);
  }
  return relative.split(path.sep).join('/');
}

async function listFiles(root: string, directory = root): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    const stats = await fs.lstat(candidate);
    if (stats.isSymbolicLink()) throw new Error(`Artifact reparse point is not allowed: ${normalizedRelative(root, candidate)}`);
    if (stats.isDirectory()) files.push(...await listFiles(root, candidate));
    else if (stats.isFile() && normalizedRelative(root, candidate) !== 'manifest.json') files.push(candidate);
    else if (!stats.isFile()) throw new Error(`Artifact is not a regular file: ${normalizedRelative(root, candidate)}`);
  }
  return files;
}

async function manifestEntries(root: string): Promise<ManifestEntry[]> {
  const files = await listFiles(root);
  const entries = await Promise.all(files.map(async (candidate) => {
    const stats = await fs.stat(candidate);
    return { path: normalizedRelative(root, candidate), sizeBytes: stats.size, sha256: await hashFile(candidate) };
  }));
  return entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function requiredEntry(entries: ManifestEntry[], candidate: string): ManifestEntry {
  const entry = entries.find((item) => item.path === candidate);
  if (!entry) throw new Error(`Required backup artifact is missing: ${candidate}`);
  return entry;
}

export async function buildManifest(root: string, runId: string): Promise<BackupManifest> {
  const entries = await manifestEntries(root);
  return {
    version: 1,
    runId,
    createdAt: new Date().toISOString(),
    sourceDatabaseSha256: requiredEntry(entries, 'sqlite-raw/source.sqlite').sha256,
    consistentDatabaseSha256: requiredEntry(entries, 'sqlite-consistent.sqlite').sha256,
    entries,
  };
}

function assertSafeManifestPath(candidate: string): void {
  if (!candidate || candidate.includes('\\') || candidate.startsWith('/') || path.posix.isAbsolute(candidate)) {
    throw new Error(`Unsafe manifest path: ${candidate}`);
  }
  const normalized = path.posix.normalize(candidate);
  if (normalized !== candidate || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`Unsafe manifest path: ${candidate}`);
  }
}

export async function verifyManifest(root: string, manifest: BackupManifest): Promise<void> {
  if (manifest.version !== 1 || !manifest.runId || !Array.isArray(manifest.entries)) {
    throw new Error('Invalid backup manifest');
  }
  const paths = manifest.entries.map((entry) => entry.path);
  for (const candidate of paths) assertSafeManifestPath(candidate);
  if (new Set(paths).size !== paths.length) throw new Error('Manifest contains duplicate paths');
  const sorted = [...paths].sort();
  if (paths.some((candidate, index) => candidate !== sorted[index])) throw new Error('Manifest entries are not sorted');

  const actualEntries = await manifestEntries(root);
  if (actualEntries.length !== manifest.entries.length) throw new Error('Manifest file set mismatch');
  for (let index = 0; index < manifest.entries.length; index += 1) {
    const expected = manifest.entries[index];
    const actual = actualEntries[index];
    if (expected.path !== actual.path) throw new Error(`Manifest file set mismatch: ${expected.path}`);
    if (expected.sizeBytes !== actual.sizeBytes) throw new Error(`Manifest size mismatch: ${expected.path}`);
    if (expected.sha256 !== actual.sha256) throw new Error(`Manifest hash mismatch: ${expected.path}`);
  }
  if (requiredEntry(manifest.entries, 'sqlite-raw/source.sqlite').sha256 !== manifest.sourceDatabaseSha256) {
    throw new Error('Manifest source database hash mismatch');
  }
  if (requiredEntry(manifest.entries, 'sqlite-consistent.sqlite').sha256 !== manifest.consistentDatabaseSha256) {
    throw new Error('Manifest consistent database hash mismatch');
  }
}
