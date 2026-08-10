import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface OwnedTemporaryDirectory {
  path: string;
  realPath: string;
  dev: string;
  ino: string;
}

export interface OwnedTemporaryDirectoryCleanupDependencies {
  rename(source: string, destination: string): Promise<void>;
  remove(candidate: string): Promise<void>;
}

export async function recordOwnedTemporaryDirectory(candidate: string): Promise<OwnedTemporaryDirectory> {
  const resolved = path.resolve(candidate);
  const stats = await fs.lstat(resolved, { bigint: true });
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error('Private inspection path is not a regular directory');
  }
  if ((await fs.readdir(resolved)).length !== 0) {
    throw new Error('Private inspection directory was not newly created');
  }
  return {
    path: resolved,
    realPath: await fs.realpath(resolved),
    dev: stats.dev.toString(),
    ino: stats.ino.toString(),
  };
}

async function pathIsMissing(candidate: string): Promise<boolean> {
  try {
    await fs.lstat(candidate);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
}

export async function cleanupOwnedTemporaryDirectory(
  owner: OwnedTemporaryDirectory,
  dependencies: OwnedTemporaryDirectoryCleanupDependencies,
): Promise<void> {
  const quarantinePath = path.join(
    path.dirname(owner.path),
    `.${path.basename(owner.path)}.cleanup-${randomUUID()}`,
  );
  await dependencies.rename(owner.path, quarantinePath);

  const quarantinedStats = await fs.lstat(quarantinePath, { bigint: true });
  const quarantinedRealPath = await fs.realpath(quarantinePath);
  const expectedRealPath = path.join(path.dirname(owner.realPath), path.basename(quarantinePath));
  if (quarantinedStats.isSymbolicLink()
    || !quarantinedStats.isDirectory()
    || quarantinedStats.dev.toString() !== owner.dev
    || quarantinedStats.ino.toString() !== owner.ino
    || quarantinedRealPath !== expectedRealPath) {
    throw new Error('Private inspection quarantine identity changed');
  }

  let removeFailed = false;
  try {
    await dependencies.remove(quarantinePath);
  } catch {
    removeFailed = true;
  }
  const quarantineMissing = await pathIsMissing(quarantinePath);
  const originalMissing = await pathIsMissing(owner.path);
  if (removeFailed || !quarantineMissing || !originalMissing) {
    throw new Error('Private inspection directory cleanup did not complete');
  }
}
