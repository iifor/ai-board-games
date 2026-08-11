import { createHash } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import path from 'node:path';
import type { FileHandle } from 'node:fs/promises';

export interface FileMetadata {
  sourcePath: string;
  realPath: string;
  archiveName: string;
  sizeBytes: number;
  mtimeNs: string;
  dev: string;
  ino: string;
}

export interface StableFile extends FileMetadata { sha256: string }
export interface StableFileContent extends StableFile { bytes: Buffer }

export interface SourceInspection { files: FileMetadata[] }
export interface SourceSnapshot { files: StableFile[] }

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function normalizeFileError(error: unknown, code: string, message: string): Error {
  if ((error as Error & { code?: string }).code === code) return error as Error;
  const detail = error instanceof Error ? error.message : String(error);
  return codedError(code, `${message}; ${detail}`);
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function sameIdentity(stats: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint }, expected: FileMetadata): boolean {
  return stats.dev.toString() === expected.dev
    && stats.ino.toString() === expected.ino
    && Number(stats.size) === expected.sizeBytes
    && stats.mtimeNs.toString() === expected.mtimeNs;
}

async function openNoFollow(candidate: string): Promise<FileHandle> {
  const noFollow = fsConstants.O_NOFOLLOW || 0;
  try {
    return await fs.open(candidate, fsConstants.O_RDONLY | noFollow);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!noFollow || !['EINVAL', 'ENOTSUP', 'EOPNOTSUPP'].includes(code || '')) throw error;
    return fs.open(candidate, fsConstants.O_RDONLY);
  }
}

async function hashHandle(handle: FileHandle): Promise<string> {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(256 * 1024);
  let position = 0;
  while (true) {
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  return hash.digest('hex');
}

async function assertPathIdentity(candidate: string, rootRealPath: string, expected: FileMetadata, code: string): Promise<void> {
  try {
    const stats = await fs.lstat(candidate, { bigint: true });
    if (stats.isSymbolicLink() || !stats.isFile()) throw codedError(code, `Regular non-reparse file is required: ${candidate}`);
    const realPath = await fs.realpath(candidate);
    if (!isInside(rootRealPath, realPath) || realPath !== expected.realPath || !sameIdentity(stats, expected)) {
      throw codedError(code, `File path or identity changed: ${candidate}`);
    }
  } catch (error) {
    throw normalizeFileError(error, code, `File path or identity changed: ${candidate}`);
  }
}

export async function inspectFileMetadata(
  candidate: string,
  rootRealPath: string,
  archiveName: string,
  code: string,
): Promise<FileMetadata> {
  try {
    const stats = await fs.lstat(candidate, { bigint: true });
    if (stats.isSymbolicLink() || !stats.isFile()) throw codedError(code, `Regular non-reparse file is required: ${candidate}`);
    const realPath = await fs.realpath(candidate);
    if (!isInside(rootRealPath, realPath)) throw codedError(code, `File resolves outside its root: ${candidate}`);
    return {
      sourcePath: candidate,
      realPath,
      archiveName,
      sizeBytes: Number(stats.size),
      mtimeNs: stats.mtimeNs.toString(),
      dev: stats.dev.toString(),
      ino: stats.ino.toString(),
    };
  } catch (error) {
    throw normalizeFileError(error, code, `File changed while inspecting metadata: ${candidate}`);
  }
}

export async function captureStableFile(
  candidate: string,
  rootRealPath: string,
  archiveName: string,
  code: string,
): Promise<StableFile> {
  try {
    const expected = await inspectFileMetadata(candidate, rootRealPath, archiveName, code);
    let handle: FileHandle | undefined;
    let sha256: string;
    try {
      handle = await openNoFollow(candidate);
      const opened = await handle.stat({ bigint: true });
      if (!sameIdentity(opened, expected)) throw codedError(code, `File identity changed while opening: ${candidate}`);
      sha256 = await hashHandle(handle);
      const afterRead = await handle.stat({ bigint: true });
      if (!sameIdentity(afterRead, expected)) throw codedError(code, `File changed while reading: ${candidate}`);
    } finally {
      await handle?.close();
    }
    const stable = { ...expected, sha256: sha256! };
    await assertPathIdentity(candidate, rootRealPath, stable, code);
    return stable;
  } catch (error) {
    throw normalizeFileError(error, code, `File changed while capturing a stable snapshot: ${candidate}`);
  }
}

export async function captureStableFileContent(
  candidate: string,
  rootRealPath: string,
  archiveName: string,
  code: string,
  maxBytes?: number,
): Promise<StableFileContent> {
  try {
    const expected = await inspectFileMetadata(candidate, rootRealPath, archiveName, code);
    if (maxBytes !== undefined && expected.sizeBytes > maxBytes) {
      throw codedError(code, `File exceeds the allowed size: ${candidate}`);
    }
    let handle: FileHandle | undefined;
    let bytes: Buffer;
    try {
      handle = await openNoFollow(candidate);
      const opened = await handle.stat({ bigint: true });
      if (!sameIdentity(opened, expected)) throw codedError(code, `File identity changed while opening: ${candidate}`);
      bytes = await handle.readFile();
      const afterRead = await handle.stat({ bigint: true });
      if (!sameIdentity(afterRead, expected) || bytes.length !== expected.sizeBytes) {
        throw codedError(code, `File changed while reading: ${candidate}`);
      }
    } finally {
      await handle?.close();
    }
    const stable = { ...expected, sha256: createHash('sha256').update(bytes!).digest('hex') };
    await assertPathIdentity(candidate, rootRealPath, stable, code);
    return { ...stable, bytes: bytes! };
  } catch (error) {
    throw normalizeFileError(error, code, `File changed while capturing a stable snapshot: ${candidate}`);
  }
}

async function exists(candidate: string): Promise<boolean> {
  try { await fs.lstat(candidate); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function captureSourceSnapshot(
  sourcePath: string,
  code = 'SOURCE_CHANGED_DURING_BACKUP',
): Promise<SourceSnapshot> {
  const inspection = await inspectSourceFiles(sourcePath, code);
  const rootRealPath = await fs.realpath(path.dirname(path.resolve(sourcePath)));
  const files = await Promise.all(inspection.files.map((file) => (
    captureStableFile(file.sourcePath, rootRealPath, file.archiveName, code)
  )));
  return { files };
}

export async function inspectSourceFiles(
  sourcePath: string,
  code = 'SOURCE_CHANGED_DURING_BACKUP',
): Promise<SourceInspection> {
  const source = path.resolve(sourcePath);
  const rootRealPath = await fs.realpath(path.dirname(source));
  if (!await exists(source)) throw codedError('SOURCE_DATABASE_INVALID', 'SQLite source file does not exist');
  const files: FileMetadata[] = [];
  for (const suffix of ['', '-wal', '-shm']) {
    const candidate = `${source}${suffix}`;
    if (suffix && !await exists(candidate)) continue;
    files.push(await inspectFileMetadata(candidate, rootRealPath, `source.sqlite${suffix}`, code));
  }
  return { files };
}

export function assertSameSourceSnapshot(
  before: SourceSnapshot,
  after: SourceSnapshot,
  code = 'SOURCE_CHANGED_DURING_BACKUP',
): void {
  const comparable = (snapshot: SourceSnapshot) => snapshot.files.map((file) => ({
    archiveName: file.archiveName,
    sizeBytes: file.sizeBytes,
    mtimeNs: file.mtimeNs,
    sha256: file.sha256,
    dev: file.dev,
    ino: file.ino,
  }));
  if (JSON.stringify(comparable(before)) !== JSON.stringify(comparable(after))) {
    throw codedError(code, 'Source database, WAL, or SHM changed during stable snapshot capture');
  }
}

export async function copySourceSnapshot(
  sourcePath: string,
  destinationRoot: string,
  code = 'SOURCE_CHANGED_DURING_BACKUP',
): Promise<SourceSnapshot> {
  const before = await captureSourceSnapshot(sourcePath, code);
  const sourceRootRealPath = await fs.realpath(path.dirname(path.resolve(sourcePath)));
  for (const file of before.files) {
    await copyStableFile(file, sourceRootRealPath, path.join(destinationRoot, file.archiveName), code);
  }
  const after = await captureSourceSnapshot(sourcePath, code);
  assertSameSourceSnapshot(before, after, code);
  return before;
}

async function writeAll(handle: FileHandle, buffer: Buffer, length: number, position: number): Promise<void> {
  let written = 0;
  while (written < length) {
    const result = await handle.write(buffer, written, length - written, position + written);
    if (result.bytesWritten <= 0) throw new Error('Destination write made no progress');
    written += result.bytesWritten;
  }
}

export async function copyStableFile(
  expected: StableFile,
  rootRealPath: string,
  destination: string,
  code: string,
): Promise<void> {
  await assertPathIdentity(expected.sourcePath, rootRealPath, expected, code);
  let sourceHandle: FileHandle | undefined;
  let destinationHandle: FileHandle | undefined;
  let destinationCreated = false;
  try {
    sourceHandle = await openNoFollow(expected.sourcePath);
    const opened = await sourceHandle.stat({ bigint: true });
    if (!sameIdentity(opened, expected)) throw codedError(code, `File identity changed while opening: ${expected.sourcePath}`);
    const openedRealPath = await fs.realpath(expected.sourcePath);
    if (openedRealPath !== expected.realPath || !isInside(rootRealPath, openedRealPath)) {
      throw codedError(code, `File escaped its root while opening: ${expected.sourcePath}`);
    }

    destinationHandle = await fs.open(destination, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_RDWR, 0o600);
    destinationCreated = true;
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(256 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await sourceHandle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      await writeAll(destinationHandle, buffer, bytesRead, position);
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    await destinationHandle.sync();
    const destinationStats = await destinationHandle.stat({ bigint: true });
    const destinationHash = await hashHandle(destinationHandle);
    if (position !== expected.sizeBytes
      || Number(destinationStats.size) !== expected.sizeBytes
      || hash.digest('hex') !== expected.sha256
      || destinationHash !== expected.sha256) {
      throw codedError(code, `Copied file does not match stable source snapshot: ${expected.sourcePath}`);
    }
    await assertPathIdentity(expected.sourcePath, rootRealPath, expected, code);
  } catch (error) {
    if (destinationHandle) await destinationHandle.close().catch(() => undefined);
    destinationHandle = undefined;
    if (destinationCreated) await fs.rm(destination, { force: true });
    throw normalizeFileError(error, code, `Stable file copy failed: ${expected.sourcePath}`);
  } finally {
    await destinationHandle?.close();
    await sourceHandle?.close();
  }
}
