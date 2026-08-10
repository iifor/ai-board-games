import { randomBytes, randomUUID } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import path from 'node:path';

const INSPECTION_DIRECTORY_NAME = 'inspection';
const OWNERSHIP_TOKEN_NAME = '.ownership-token';
const SOURCE_FILE_NAMES = ['source.sqlite', 'source.sqlite-wal', 'source.sqlite-shm'] as const;
const ALLOWED_FILE_NAMES = new Set<string>([OWNERSHIP_TOKEN_NAME, ...SOURCE_FILE_NAMES]);

interface FileIdentity {
  dev: string;
  ino: string;
  size: string;
}

export interface OwnedTemporaryDirectory {
  parentPath: string;
  parentRealPath: string;
  parentDev: string;
  parentIno: string;
  path: string;
  realPath: string;
  dev: string;
  ino: string;
  token: string;
  tokenIdentity: FileIdentity;
}

export interface OwnedTemporaryDirectoryCleanupDependencies {
  rename(source: string, destination: string): Promise<void>;
  list(candidate: string): Promise<string[]>;
  unlink(candidate: string): Promise<void>;
  rmdir(candidate: string): Promise<void>;
}

function directoryIdentity(stats: { dev: bigint; ino: bigint }): Pick<FileIdentity, 'dev' | 'ino'> {
  return { dev: stats.dev.toString(), ino: stats.ino.toString() };
}

function fileIdentity(stats: { dev: bigint; ino: bigint; size: bigint }): FileIdentity {
  return { ...directoryIdentity(stats), size: stats.size.toString() };
}

function sameFileIdentity(actual: FileIdentity, expected: FileIdentity): boolean {
  return actual.dev === expected.dev && actual.ino === expected.ino && actual.size === expected.size;
}

async function assertDirectoryIdentity(
  candidate: string,
  expectedRealPath: string,
  expectedDev: string,
  expectedIno: string,
): Promise<void> {
  const stats = await fs.lstat(candidate, { bigint: true });
  const realPath = await fs.realpath(candidate);
  if (stats.isSymbolicLink()
    || !stats.isDirectory()
    || stats.dev.toString() !== expectedDev
    || stats.ino.toString() !== expectedIno
    || realPath !== expectedRealPath) {
    throw new Error('Private inspection directory identity changed');
  }
}

async function captureRegularFile(candidate: string): Promise<FileIdentity> {
  const stats = await fs.lstat(candidate, { bigint: true });
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error('Private inspection entry is not a regular file');
  }
  return fileIdentity(stats);
}

async function assertRegularFileIdentity(candidate: string, expected: FileIdentity): Promise<void> {
  if (!sameFileIdentity(await captureRegularFile(candidate), expected)) {
    throw new Error('Private inspection file identity changed');
  }
}

async function readTokenNoFollow(candidate: string, expected: FileIdentity): Promise<string> {
  await assertRegularFileIdentity(candidate, expected);
  const handle = await fs.open(candidate, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stats = await handle.stat({ bigint: true });
    if (!stats.isFile() || !sameFileIdentity(fileIdentity(stats), expected)) {
      throw new Error('Private inspection ownership token identity changed');
    }
    return await handle.readFile({ encoding: 'utf8' });
  } finally {
    await handle.close();
  }
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

function assertExactWhitelist(names: string[]): void {
  const uniqueNames = new Set(names);
  if (uniqueNames.size !== names.length
    || !uniqueNames.has(OWNERSHIP_TOKEN_NAME)
    || !uniqueNames.has('source.sqlite')
    || names.some((name) => !ALLOWED_FILE_NAMES.has(name))) {
    throw new Error('Private inspection directory contains unexpected entries');
  }
}

async function captureStagedFiles(owner: OwnedTemporaryDirectory): Promise<Map<string, FileIdentity>> {
  const names = await fs.readdir(owner.path);
  assertExactWhitelist(names);
  const staged = new Map<string, FileIdentity>();
  for (const name of names) {
    staged.set(name, await captureRegularFile(path.join(owner.path, name)));
  }
  if (!sameFileIdentity(staged.get(OWNERSHIP_TOKEN_NAME)!, owner.tokenIdentity)
    || await readTokenNoFollow(path.join(owner.path, OWNERSHIP_TOKEN_NAME), owner.tokenIdentity) !== owner.token) {
    throw new Error('Private inspection ownership token changed');
  }
  return staged;
}

async function assertOriginalPathMissing(owner: OwnedTemporaryDirectory): Promise<void> {
  if (!await pathIsMissing(owner.path)) {
    throw new Error('Private inspection path was reoccupied');
  }
}

export async function recordOwnedTemporaryDirectory(candidate: string): Promise<OwnedTemporaryDirectory> {
  const parentPath = path.resolve(candidate);
  const parentStats = await fs.lstat(parentPath, { bigint: true });
  if (parentStats.isSymbolicLink() || !parentStats.isDirectory()) {
    throw new Error('Private inspection parent is not a regular directory');
  }
  if ((await fs.readdir(parentPath)).length !== 0) {
    throw new Error('Private inspection parent was not newly created');
  }

  const parentRealPath = await fs.realpath(parentPath);
  const inspectionPath = path.join(parentPath, INSPECTION_DIRECTORY_NAME);
  await fs.mkdir(inspectionPath);
  const inspectionStats = await fs.lstat(inspectionPath, { bigint: true });
  const token = randomBytes(32).toString('hex');
  const tokenPath = path.join(inspectionPath, OWNERSHIP_TOKEN_NAME);
  await fs.writeFile(tokenPath, token, { encoding: 'utf8', flag: 'wx', mode: 0o600 });

  return {
    parentPath,
    parentRealPath,
    parentDev: parentStats.dev.toString(),
    parentIno: parentStats.ino.toString(),
    path: inspectionPath,
    realPath: await fs.realpath(inspectionPath),
    dev: inspectionStats.dev.toString(),
    ino: inspectionStats.ino.toString(),
    token,
    tokenIdentity: await captureRegularFile(tokenPath),
  };
}

export async function cleanupOwnedTemporaryDirectory(
  owner: OwnedTemporaryDirectory,
  dependencies: OwnedTemporaryDirectoryCleanupDependencies,
): Promise<void> {
  await assertDirectoryIdentity(owner.parentPath, owner.parentRealPath, owner.parentDev, owner.parentIno);
  await assertDirectoryIdentity(owner.path, owner.realPath, owner.dev, owner.ino);
  const stagedFiles = await captureStagedFiles(owner);
  const quarantinePath = path.join(owner.parentPath, `.inspection-cleanup-${randomUUID()}`);
  await dependencies.rename(owner.path, quarantinePath);

  const quarantineRealPath = path.join(owner.parentRealPath, path.basename(quarantinePath));
  await assertDirectoryIdentity(owner.parentPath, owner.parentRealPath, owner.parentDev, owner.parentIno);
  await assertDirectoryIdentity(quarantinePath, quarantineRealPath, owner.dev, owner.ino);
  await assertOriginalPathMissing(owner);

  const quarantinedNames = await dependencies.list(quarantinePath);
  await assertDirectoryIdentity(owner.parentPath, owner.parentRealPath, owner.parentDev, owner.parentIno);
  await assertDirectoryIdentity(quarantinePath, quarantineRealPath, owner.dev, owner.ino);
  await assertOriginalPathMissing(owner);
  assertExactWhitelist(quarantinedNames);
  if (quarantinedNames.length !== stagedFiles.size
    || quarantinedNames.some((name) => !stagedFiles.has(name))) {
    throw new Error('Private inspection staged file set changed');
  }

  for (const name of quarantinedNames) {
    await assertRegularFileIdentity(path.join(quarantinePath, name), stagedFiles.get(name)!);
  }
  if (await readTokenNoFollow(path.join(quarantinePath, OWNERSHIP_TOKEN_NAME), owner.tokenIdentity) !== owner.token) {
    throw new Error('Private inspection ownership token changed');
  }

  for (const name of SOURCE_FILE_NAMES) {
    const expected = stagedFiles.get(name);
    if (!expected) continue;
    const candidate = path.join(quarantinePath, name);
    await assertOriginalPathMissing(owner);
    await assertDirectoryIdentity(quarantinePath, quarantineRealPath, owner.dev, owner.ino);
    await assertRegularFileIdentity(candidate, expected);
    await dependencies.unlink(candidate);
    if (!await pathIsMissing(candidate)) {
      throw new Error('Private inspection file cleanup did not complete');
    }
  }

  const tokenPath = path.join(quarantinePath, OWNERSHIP_TOKEN_NAME);
  await assertOriginalPathMissing(owner);
  if (await readTokenNoFollow(tokenPath, owner.tokenIdentity) !== owner.token) {
    throw new Error('Private inspection ownership token changed');
  }
  await dependencies.unlink(tokenPath);
  if (!await pathIsMissing(tokenPath)) {
    throw new Error('Private inspection token cleanup did not complete');
  }
  if ((await dependencies.list(quarantinePath)).length !== 0) {
    throw new Error('Private inspection quarantine is not empty');
  }

  await assertOriginalPathMissing(owner);
  await assertDirectoryIdentity(quarantinePath, quarantineRealPath, owner.dev, owner.ino);
  await dependencies.rmdir(quarantinePath);
  if (!await pathIsMissing(quarantinePath)) {
    throw new Error('Private inspection quarantine cleanup did not complete');
  }

  await assertOriginalPathMissing(owner);
  await assertDirectoryIdentity(owner.parentPath, owner.parentRealPath, owner.parentDev, owner.parentIno);
  await dependencies.rmdir(owner.parentPath);
  if (!await pathIsMissing(owner.parentPath)
    || !await pathIsMissing(owner.path)
    || !await pathIsMissing(quarantinePath)) {
    throw new Error('Private inspection parent cleanup did not complete');
  }
}
