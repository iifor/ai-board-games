import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { verifyManifest, type BackupManifest } from './manifest';

export interface FinalReservation {
  root: string;
  ownerToken: string;
  nonce: string;
  dev: string;
  ino: string;
}

export interface QuarantineResult {
  failureSite: string;
  unmovedEvidence: string[];
}

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

export async function pathExists(candidate: string): Promise<boolean> {
  try { await fs.lstat(candidate); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function createUniqueSite(output: string, runId: string, kind: 'staging' | 'failed'): Promise<string> {
  await fs.mkdir(output, { recursive: true });
  const safeRunId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId) ? runId : 'invalid-run';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = path.join(output, `${kind === 'staging' ? '.' : ''}${safeRunId}.${kind}-${randomUUID()}`);
    try { await fs.mkdir(candidate); return candidate; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw codedError('BACKUP_SITE_RESERVATION_FAILED', `Unable to reserve unique ${kind} site`);
}

export async function reserveFinal(output: string, runId: string): Promise<FinalReservation> {
  const root = path.join(output, runId);
  try { await fs.mkdir(root); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw codedError('BACKUP_RUN_ALREADY_EXISTS', 'Backup final run was concurrently created');
    }
    throw error;
  }
  const stats = await fs.lstat(root, { bigint: true });
  const nonce = randomUUID();
  const ownerToken = path.join(output, `.${runId}.owner-${randomUUID()}`);
  try {
    const handle = await fs.open(ownerToken, 'wx');
    try { await handle.writeFile(nonce, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
  } catch (error) {
    await fs.rmdir(root).catch(() => undefined);
    throw error;
  }
  return { root, ownerToken, nonce, dev: stats.dev.toString(), ino: stats.ino.toString() };
}

export async function ownsReservation(reservation: FinalReservation): Promise<boolean> {
  try {
    const [stats, nonce] = await Promise.all([
      fs.lstat(reservation.root, { bigint: true }),
      fs.readFile(reservation.ownerToken, 'utf8'),
    ]);
    return stats.isDirectory()
      && stats.dev.toString() === reservation.dev
      && stats.ino.toString() === reservation.ino
      && nonce === reservation.nonce;
  } catch {
    return false;
  }
}

async function moveEntries(source: string, destination: string, includeManifest: boolean): Promise<void> {
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.name === 'manifest.json' && !includeManifest) continue;
    await fs.rename(path.join(source, entry.name), path.join(destination, entry.name));
  }
}

export async function publishReserved(
  stagingRoot: string,
  reservation: FinalReservation,
  manifest: BackupManifest,
): Promise<void> {
  if (!await ownsReservation(reservation)) throw codedError('FINAL_RESERVATION_LOST', 'Final directory reservation ownership was lost');
  await moveEntries(stagingRoot, reservation.root, false);
  await verifyManifest(reservation.root, manifest);
  if (!await ownsReservation(reservation)) throw codedError('FINAL_RESERVATION_LOST', 'Final directory reservation ownership was lost');
  await fs.rename(path.join(stagingRoot, 'manifest.json'), path.join(reservation.root, 'manifest.json'));
  await fs.rmdir(stagingRoot);
}

async function moveFailureEvidence(source: string, failureSite: string): Promise<void> {
  await fs.rm(path.join(source, 'manifest.json'), { force: true });
  await moveEntries(source, failureSite, false);
  await fs.rmdir(source).catch(() => undefined);
}

export async function quarantineOwned(
  failureSite: string,
  stagingRoot: string | undefined,
  reservation: FinalReservation | undefined,
): Promise<QuarantineResult> {
  const unmovedEvidence: string[] = [];
  if (reservation) {
    if (await ownsReservation(reservation)) {
      try { await moveFailureEvidence(reservation.root, failureSite); }
      catch { unmovedEvidence.push(reservation.root); }
      try { await fs.rm(reservation.ownerToken, { force: true }); }
      catch { unmovedEvidence.push(reservation.ownerToken); }
    } else {
      unmovedEvidence.push(reservation.root);
    }
  }
  if (stagingRoot && await pathExists(stagingRoot)) {
    const remainder = path.join(failureSite, 'staging-remainder');
    try {
      await fs.mkdir(remainder);
      await moveFailureEvidence(stagingRoot, remainder);
      await fs.rmdir(remainder).catch(() => undefined);
    } catch {
      unmovedEvidence.push(stagingRoot);
    }
  }
  return { failureSite, unmovedEvidence };
}

export async function releaseReservation(reservation: FinalReservation): Promise<void> {
  await fs.rm(reservation.ownerToken, { force: true });
}
