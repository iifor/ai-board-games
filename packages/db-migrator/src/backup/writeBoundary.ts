import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface BackupWriteBoundaryOptions {
  backupDirectory: string;
  outputDirectory: string;
  restoreDirectory?: string;
  writePaths: string[];
  errorCode: string;
}

function codedError(code: string): Error & { code: string } {
  return Object.assign(new Error('Backup evidence output is unsafe'), { code });
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function canonicalFuturePath(candidate: string): Promise<string> {
  let existing = path.resolve(candidate);
  const missing: string[] = [];
  while (true) {
    try {
      await fs.lstat(existing);
      const real = await fs.realpath(existing);
      return path.join(real, ...missing);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = path.dirname(existing);
      if (parent === existing) throw error;
      missing.unshift(path.basename(existing));
      existing = parent;
    }
  }
}

function pathKey(candidate: string): string {
  return process.platform === 'win32' ? candidate.toLowerCase() : candidate;
}

function overlaps(left: string, right: string): boolean {
  const leftKey = pathKey(left);
  const rightKey = pathKey(right);
  return isInside(leftKey, rightKey) || isInside(rightKey, leftKey);
}

export async function assertBackupWriteBoundary(options: BackupWriteBoundaryOptions): Promise<void> {
  try {
    const backup = await canonicalFuturePath(options.backupDirectory);
    const output = await canonicalFuturePath(options.outputDirectory);
    if (isInside(pathKey(backup), pathKey(output))) throw codedError(options.errorCode);
    if (options.restoreDirectory) {
      const restore = await canonicalFuturePath(options.restoreDirectory);
      if (isInside(pathKey(backup), pathKey(restore))) throw codedError(options.errorCode);
    }
    for (const candidate of options.writePaths) {
      if (overlaps(backup, await canonicalFuturePath(candidate))) throw codedError(options.errorCode);
    }
  } catch (error) {
    if ((error as Error & { code?: string }).code === options.errorCode) throw error;
    throw codedError(options.errorCode);
  }
}
