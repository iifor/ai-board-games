import { promises as fs } from 'node:fs';
import path from 'node:path';
import { captureStableFile, copyStableFile, type StableFile } from '../backup/fileSnapshot';
import type { VerifiedBackup } from '../backup/manifestEvidence';
import type { RestorePlan } from './restorePlan';

export interface RestoredFile { path: string; relativePath: string; sizeBytes: number; sha256: string }
export interface RestoreOwnership { rootRealPath: string; token: StableFile }
export interface RestoreCopy { restored: RestoredFile[]; ownership: RestoreOwnership }

function codedError(code: string): Error & { code: string } {
  return Object.assign(new Error('Restore drill file copy failed'), { code });
}

async function exists(candidate: string): Promise<boolean> {
  try { await fs.lstat(candidate); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function claimRestoreRoot(root: string): Promise<RestoreOwnership> {
  const parent = path.dirname(root);
  const parentStats = await fs.lstat(parent);
  if (parentStats.isSymbolicLink() || !parentStats.isDirectory()) throw codedError('RESTORE_TARGET_INVALID');
  const parentReal = await fs.realpath(parent);
  try { await fs.mkdir(root); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const stats = await fs.lstat(root);
    if (stats.isSymbolicLink() || !stats.isDirectory() || (await fs.readdir(root)).length !== 0) {
      throw codedError('RESTORE_TARGET_NOT_EMPTY');
    }
  }
  const rootStats = await fs.lstat(root);
  const rootReal = await fs.realpath(root);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory() || path.dirname(rootReal) !== parentReal) {
    throw codedError('RESTORE_TARGET_INVALID');
  }
  const tokenPath = path.join(root, '.restore-owner');
  let tokenHandle;
  try {
    tokenHandle = await fs.open(tokenPath, 'wx', 0o600);
    await tokenHandle.writeFile(`${process.pid}\n`);
    await tokenHandle.sync();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw codedError('RESTORE_TARGET_IN_USE');
    throw error;
  } finally {
    await tokenHandle?.close();
  }
  const token = await captureStableFile(tokenPath, rootReal, '.restore-owner', 'RESTORE_TARGET_IN_USE');
  return { rootRealPath: rootReal, token };
}

function sameStable(left: StableFile, right: StableFile): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.sizeBytes === right.sizeBytes
    && left.mtimeNs === right.mtimeNs && left.realPath === right.realPath && left.sha256 === right.sha256;
}

export async function copyRestorePlan(verified: VerifiedBackup, plan: RestorePlan): Promise<RestoreCopy> {
  const ownership = await claimRestoreRoot(plan.restoreRoot);
  const restoreReal = ownership.rootRealPath;
  const restored: RestoredFile[] = [];
  for (const file of plan.files) {
    const source = verified.files.get(file.entry.path);
    if (!source) throw codedError('RESTORE_SOURCE_CHANGED');
    await fs.mkdir(path.dirname(file.destinationPath), { recursive: true });
    await copyStableFile(source, verified.rootRealPath, file.destinationPath, 'RESTORE_SOURCE_CHANGED');
    const captured = await captureStableFile(
      file.destinationPath,
      restoreReal,
      file.entry.path,
      'RESTORE_DESTINATION_CHANGED',
    );
    if (captured.sizeBytes !== file.entry.sizeBytes || captured.sha256 !== file.entry.sha256) {
      throw codedError('RESTORE_DESTINATION_MISMATCH');
    }
    restored.push({
      path: file.destinationPath,
      relativePath: path.relative(path.dirname(plan.restoreRoot), file.destinationPath).split(path.sep).join('/'),
      sizeBytes: captured.sizeBytes,
      sha256: captured.sha256,
    });
  }

  const manifestDestination = path.join(plan.restoreRoot, 'manifest.json');
  await copyStableFile(verified.manifestFile, verified.rootRealPath, manifestDestination, 'RESTORE_SOURCE_CHANGED');
  const restoredManifest = await captureStableFile(
    manifestDestination,
    restoreReal,
    'manifest.json',
    'RESTORE_DESTINATION_CHANGED',
  );
  if (restoredManifest.sha256 !== verified.manifestFile.sha256
    || restoredManifest.sizeBytes !== verified.manifestFile.sizeBytes) throw codedError('RESTORE_DESTINATION_MISMATCH');
  restored.push({
    path: manifestDestination,
    relativePath: path.relative(path.dirname(plan.restoreRoot), manifestDestination).split(path.sep).join('/'),
    sizeBytes: restoredManifest.sizeBytes,
    sha256: restoredManifest.sha256,
  });
  if (!await exists(plan.restoreRoot)) throw codedError('RESTORE_TARGET_INVALID');
  const finalManifest = await captureStableFile(
    verified.manifestPath,
    verified.rootRealPath,
    'manifest.json',
    'RESTORE_SOURCE_CHANGED',
  );
  if (!sameStable(verified.manifestFile, finalManifest)) throw codedError('RESTORE_SOURCE_CHANGED');
  return { restored, ownership };
}

export async function releaseRestoreOwnership(ownership: RestoreOwnership): Promise<void> {
  const current = await captureStableFile(
    ownership.token.sourcePath,
    ownership.rootRealPath,
    '.restore-owner',
    'RESTORE_TARGET_IN_USE',
  );
  if (!sameStable(ownership.token, current)) throw codedError('RESTORE_TARGET_IN_USE');
  await fs.rm(ownership.token.sourcePath);
}

export async function assertExactRestoredFileSet(root: string, expectedPaths: string[]): Promise<void> {
  const rootReal = await fs.realpath(root);
  const actual: string[] = [];
  const visit = async (directory: string, relativeRoot: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const relative = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;
      const candidate = path.join(directory, entry.name);
      const stats = await fs.lstat(candidate);
      if (stats.isSymbolicLink()) throw codedError('RESTORE_DESTINATION_MISMATCH');
      const real = await fs.realpath(candidate);
      const outside = path.relative(rootReal, real);
      if (outside === '..' || outside.startsWith(`..${path.sep}`) || path.isAbsolute(outside)) {
        throw codedError('RESTORE_DESTINATION_MISMATCH');
      }
      if (stats.isDirectory()) await visit(candidate, relative);
      else if (stats.isFile()) actual.push(relative);
      else throw codedError('RESTORE_DESTINATION_MISMATCH');
    }
  };
  await visit(root, '');
  const normalize = (value: string): string => process.platform === 'win32' ? value.toLowerCase() : value;
  const actualKeys = actual.map(normalize).sort();
  const expectedKeys = expectedPaths.map(normalize).sort();
  if (new Set(actualKeys).size !== actualKeys.length || new Set(expectedKeys).size !== expectedKeys.length
    || JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) throw codedError('RESTORE_DESTINATION_MISMATCH');
}
