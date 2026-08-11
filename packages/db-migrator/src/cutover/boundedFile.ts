import { createHash } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import type { FileHandle } from 'node:fs/promises';

export interface BoundedFileCapture {
  bytes: Buffer;
  sizeBytes: number;
  sha256: string;
}

function fixedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function sameFile(
  left: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint; ctimeNs: bigint },
  right: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint; ctimeNs: bigint },
): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

async function openNoFollow(candidate: string): Promise<FileHandle> {
  const noFollow = constants.O_NOFOLLOW || 0;
  try {
    return await fs.open(candidate, constants.O_RDONLY | noFollow);
  } catch (error) {
    if (!noFollow || !['EINVAL', 'ENOTSUP', 'EOPNOTSUPP'].includes((error as NodeJS.ErrnoException).code || '')) {
      throw error;
    }
    return fs.open(candidate, constants.O_RDONLY);
  }
}

export async function captureBoundedFile(
  candidate: string,
  maxBytes: number,
  code: string,
  message: string,
): Promise<BoundedFileCapture> {
  let handle: FileHandle | undefined;
  try {
    const resolved = path.resolve(candidate);
    const root = await fs.realpath(path.dirname(resolved));
    const before = await fs.lstat(resolved, { bigint: true });
    if (before.isSymbolicLink() || !before.isFile() || before.size > BigInt(maxBytes)) throw fixedError(code, message);
    const realPath = await fs.realpath(resolved);
    if (path.dirname(realPath) !== root) throw fixedError(code, message);
    handle = await openNoFollow(resolved);
    const opened = await handle.stat({ bigint: true });
    if (!sameFile(before, opened)) throw fixedError(code, message);
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const afterRead = await handle.stat({ bigint: true });
    if (bytesRead > maxBytes || bytesRead !== Number(before.size) || !sameFile(before, afterRead)) {
      throw fixedError(code, message);
    }
    await handle.close();
    handle = undefined;
    const afterClose = await fs.lstat(resolved, { bigint: true });
    if (!sameFile(before, afterClose) || await fs.realpath(resolved) !== realPath) throw fixedError(code, message);
    const bytes = buffer.subarray(0, bytesRead);
    return { bytes, sizeBytes: bytesRead, sha256: createHash('sha256').update(bytes).digest('hex') };
  } catch {
    try { await handle?.close(); } catch { /* preserve fixed error */ }
    throw fixedError(code, message);
  }
}
