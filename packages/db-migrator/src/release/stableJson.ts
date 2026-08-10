import { createHash } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import path from 'node:path';

const MAX_JSON_BYTES = 16 * 1024 * 1024;
const CHUNK_BYTES = 256 * 1024;

export interface StableJson<T> {
  value: T;
  sha256: string;
  sizeBytes: number;
  resolvedPath: string;
}

export function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function pathKey(candidate: string): string {
  const resolved = path.resolve(candidate);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function sameFile(left: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint }, right: typeof left): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeNs === right.mtimeNs;
}

export async function readStableJson<T>(candidate: string, rootPath: string, rootRealPath: string): Promise<StableJson<T>> {
  const resolvedPath = path.resolve(candidate);
  if (!isInside(rootPath, resolvedPath)) throw new Error('Evidence path escapes the signoff directory');
  const before = await fs.lstat(resolvedPath, { bigint: true });
  if (before.isSymbolicLink() || !before.isFile() || before.size > BigInt(MAX_JSON_BYTES)) {
    throw new Error('Evidence must be a bounded regular non-reparse JSON file');
  }
  const beforeRealPath = await fs.realpath(resolvedPath);
  if (!isInside(rootRealPath, beforeRealPath)) throw new Error('Evidence resolves outside the signoff directory');
  const handle = await fs.open(resolvedPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
  const chunks: Buffer[] = [];
  const hash = createHash('sha256');
  let sizeBytes = 0;
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameFile(before, opened)) throw new Error('Evidence changed while opening');
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(CHUNK_BYTES, MAX_JSON_BYTES - sizeBytes + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, sizeBytes);
      if (!bytesRead) break;
      sizeBytes += bytesRead;
      if (sizeBytes > MAX_JSON_BYTES) throw new Error('Evidence JSON exceeds the size limit');
      const bytes = chunk.subarray(0, bytesRead);
      chunks.push(bytes);
      hash.update(bytes);
    }
    const afterRead = await handle.stat({ bigint: true });
    if (!sameFile(opened, afterRead) || BigInt(sizeBytes) !== opened.size) throw new Error('Evidence changed while reading');
  } finally {
    await handle.close();
  }
  const after = await fs.lstat(resolvedPath, { bigint: true });
  const afterRealPath = await fs.realpath(resolvedPath);
  if (!sameFile(before, after) || afterRealPath !== beforeRealPath) throw new Error('Evidence path changed after reading');
  return {
    value: JSON.parse(Buffer.concat(chunks, sizeBytes).toString('utf8')) as T,
    sha256: hash.digest('hex'),
    sizeBytes,
    resolvedPath,
  };
}
