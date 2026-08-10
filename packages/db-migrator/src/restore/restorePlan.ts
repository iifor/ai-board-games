import { promises as fs } from 'node:fs';
import path from 'node:path';
import { captureStableFileContent } from '../backup/fileSnapshot';
import type { VerifiedBackup } from '../backup/manifestEvidence';
import type { ManifestEntry } from '../backup/manifest';

export interface ResourceRestoreMapping { sourceIndex: number; destination: string }
export interface RestoreFile { entry: ManifestEntry; sourcePath: string; destinationPath: string }
export interface RestorePlan { restoreRoot: string; files: RestoreFile[]; resourceIndexes: number[] }

interface ResourceMapFile { version: 1; resources: ResourceRestoreMapping[] }

function codedError(code: string): Error & { code: string } {
  return Object.assign(new Error('Restore drill plan is invalid'), { code });
}

function fail(code: string): never { throw codedError(code); }

function pathKey(candidate: string): string {
  const resolved = path.resolve(candidate);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function safeRelative(candidate: unknown): candidate is string {
  return typeof candidate === 'string' && Boolean(candidate) && !candidate.includes('\\')
    && !path.posix.isAbsolute(candidate) && path.posix.normalize(candidate) === candidate
    && candidate !== '..' && !candidate.startsWith('../');
}

export async function loadResourceRestoreMap(candidate: string): Promise<ResourceRestoreMapping[]> {
  try {
    const resolved = path.resolve(candidate);
    const rootRealPath = await fs.realpath(path.dirname(resolved));
    const captured = await captureStableFileContent(resolved, rootRealPath, path.basename(resolved), 'RESTORE_MAP_CHANGED');
    const value = JSON.parse(captured.bytes.toString('utf8')) as Partial<ResourceMapFile>;
    if (value.version !== 1 || !Array.isArray(value.resources)) fail('RESTORE_MAP_INVALID');
    return value.resources;
  } catch (error) {
    if ((error as Error & { code?: string }).code?.startsWith('RESTORE_')) throw error;
    fail('RESTORE_MAP_INVALID');
  }
}

function validateMappings(mappings: ResourceRestoreMapping[], expectedIndexes: number[]): Map<number, string> {
  if (!Array.isArray(mappings)) fail('RESTORE_MAP_INVALID');
  const byIndex = new Map<number, string>();
  const destinations = new Set<string>();
  for (const mapping of mappings) {
    if (!mapping || !Number.isInteger(mapping.sourceIndex) || mapping.sourceIndex < 0 || mapping.sourceIndex > 999
      || !safeRelative(mapping.destination)) fail('RESTORE_MAP_INVALID');
    const key = mapping.destination.toLowerCase();
    if (byIndex.has(mapping.sourceIndex) || destinations.has(key)) fail('RESTORE_MAP_INVALID');
    byIndex.set(mapping.sourceIndex, mapping.destination);
    destinations.add(key);
  }
  const actual = [...byIndex.keys()].sort((left, right) => left - right);
  if (actual.length !== expectedIndexes.length || actual.some((value, index) => value !== expectedIndexes[index])) {
    fail('RESTORE_MAP_INCOMPLETE');
  }
  const destinationPaths = [...byIndex.values()].map((value) => value.split('/'));
  for (let left = 0; left < destinationPaths.length; left += 1) {
    for (let right = left + 1; right < destinationPaths.length; right += 1) {
      const leftKey = destinationPaths[left].map((part) => part.toLowerCase());
      const rightKey = destinationPaths[right].map((part) => part.toLowerCase());
      const common = Math.min(leftKey.length, rightKey.length);
      if (leftKey.slice(0, common).join('/') === rightKey.slice(0, common).join('/')) fail('RESTORE_MAP_INVALID');
    }
  }
  return byIndex;
}

function repositorySensitiveRoots(): string[] {
  let candidate = path.resolve(__dirname);
  while (path.dirname(candidate) !== candidate) {
    try {
      if (require('node:fs').existsSync(path.join(candidate, 'pnpm-workspace.yaml'))) {
        return [candidate, path.join(candidate, 'packages', 'data'), path.join(candidate, 'packages', 'server', 'resources')];
      }
    } catch { /* continue walking */ }
    candidate = path.dirname(candidate);
  }
  return [];
}

export function buildRestorePlan(
  verified: VerifiedBackup,
  outputDirectory: string,
  restoreDirectory: string,
  mappings: ResourceRestoreMapping[],
): RestorePlan {
  const output = path.resolve(outputDirectory);
  const restoreRoot = path.resolve(restoreDirectory);
  if (restoreRoot === output || !isInside(output, restoreRoot) || restoreRoot === verified.root
    || repositorySensitiveRoots().some((root) => pathKey(root) === pathKey(restoreRoot))) fail('RESTORE_TARGET_INVALID');

  const resourceEntries = verified.manifest.entries.map((entry) => {
    const match = /^resources\/resource-(\d{3})\/(.+)$/.exec(entry.path);
    return match ? { entry, sourceIndex: Number(match[1]), relative: match[2] } : null;
  }).filter((value): value is { entry: ManifestEntry; sourceIndex: number; relative: string } => Boolean(value));
  const resourceIndexes = [...new Set(resourceEntries.map((item) => item.sourceIndex))].sort((a, b) => a - b);
  const byIndex = validateMappings(mappings, resourceIndexes);
  const files: RestoreFile[] = [];
  for (const entry of verified.manifest.entries) {
    let relativeDestination: string;
    const resource = /^resources\/resource-(\d{3})\/(.+)$/.exec(entry.path);
    if (resource) {
      const mapped = byIndex.get(Number(resource[1]));
      if (!mapped || !safeRelative(resource[2])) fail('RESTORE_BACKUP_LAYOUT_INVALID');
      relativeDestination = path.posix.join(mapped, resource[2]);
    } else if (/^sqlite-raw\/source\.sqlite(?:-(?:wal|shm))?$/.test(entry.path)
      || /^sqlite-consistent\.sqlite(?:-(?:wal|shm))?$/.test(entry.path)) {
      relativeDestination = entry.path;
    } else fail('RESTORE_BACKUP_LAYOUT_INVALID');
    const destinationPath = path.join(restoreRoot, ...relativeDestination.split('/'));
    if (!isInside(restoreRoot, destinationPath)) fail('RESTORE_TARGET_INVALID');
    files.push({ entry, sourcePath: path.join(verified.root, ...entry.path.split('/')), destinationPath });
  }
  const destinationKeys = files.map((file) => pathKey(file.destinationPath));
  if (new Set(destinationKeys).size !== destinationKeys.length) fail('RESTORE_TARGET_INVALID');
  return { restoreRoot, files, resourceIndexes };
}
