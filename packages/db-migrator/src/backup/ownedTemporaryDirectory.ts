import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface OwnedTemporaryDirectory {
  path: string;
  realPath: string;
  dev: string;
  ino: string;
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

export async function assertOwnedTemporaryDirectory(owner: OwnedTemporaryDirectory): Promise<void> {
  const stats = await fs.lstat(owner.path, { bigint: true });
  const realPath = await fs.realpath(owner.path);
  if (stats.isSymbolicLink()
    || !stats.isDirectory()
    || stats.dev.toString() !== owner.dev
    || stats.ino.toString() !== owner.ino
    || realPath !== owner.realPath) {
    throw new Error('Private inspection directory identity changed');
  }
}
