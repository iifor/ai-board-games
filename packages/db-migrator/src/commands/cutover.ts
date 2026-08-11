import { isSafeRunId } from '../backup/publication';
import { assertCutoverAuthorizationCurrent, loadCutoverAuthorization } from '../cutover/authorization';
import {
  loadVerifiedCutoverSource,
} from '../cutover/evidence';
import { defaultCutoverDependencies, executeReservedCutover, type CutoverDependencies } from '../cutover/orchestrator';
import { openVerifiedCutoverSource } from '../cutover/sourceIdentity';
import { validateCutoverEnvironment } from '../cutover/targetSession';
import { buildCutoverReport } from '../cutover/reporting';
import type { CutoverOptions, LoadCutoverAuthorizationOptions } from '../cutover/types';
import type { ReadinessCheck, ReadinessReport } from '../reporting/reportTypes';

const GIT_SHA = /^[a-f0-9]{40}$/;

function invalidParameters(): Error & { code: 'CUTOVER_INVALID_PARAMETERS' } {
  return Object.assign(new Error('Production cutover parameters are invalid'), {
    code: 'CUTOVER_INVALID_PARAMETERS' as const,
  });
}

function validOptions(options: CutoverOptions): boolean {
  return isSafeRunId(options.runId)
    && Boolean(options.sourceSnapshotPath.trim() && options.sourceManifestPath.trim() && options.outputDirectory.trim())
    && (!options.execute || (
      GIT_SHA.test(options.releaseCandidate) && !/^0{40}$/.test(options.releaseCandidate)
      && Boolean(options.authorizationPath?.trim())
    ));
}

export async function runCutover(
  options: CutoverOptions,
  dependencies: Partial<CutoverDependencies> = {},
): Promise<ReadinessReport> {
  if (!validOptions(options)) throw invalidParameters();
  const resolved = { ...defaultCutoverDependencies, ...dependencies };
  const started = resolved.now();
  const initialSource = await loadVerifiedCutoverSource(options.sourceSnapshotPath, options.sourceManifestPath);
  const sourceCheck: ReadinessCheck = {
    id: 'source.snapshot.sha256', status: 'passed',
    expected: initialSource.sourceSnapshotSha256, actual: initialSource.sourceSnapshotSha256,
    message: 'Consistent SQLite snapshot matches the verified backup manifest',
  };
  const manifestCheck: ReadinessCheck = {
    id: 'source.manifest.sha256', status: 'passed',
    expected: initialSource.manifestSha256, actual: initialSource.manifestSha256,
    message: 'Verified backup manifest bytes are fixed for this cutover',
  };
  if (!options.execute) {
    return buildCutoverReport(options, started, resolved.now(), [
      sourceCheck, manifestCheck,
      { id: 'execution', status: 'skipped', message: 'Dry-run performed no database calls or filesystem writes' },
    ], [], []);
  }

  const authorizationContext: Omit<LoadCutoverAuthorizationOptions, 'authorizationPath' | 'now'> = {
    runId: options.runId,
    releaseCandidate: options.releaseCandidate,
    manifestSha256: initialSource.manifestSha256,
    sourceSnapshotSha256: initialSource.sourceSnapshotSha256,
  };
  const authorization = await loadCutoverAuthorization({
    authorizationPath: options.authorizationPath!,
    ...authorizationContext,
    now: started,
  });
  const finalSource = await loadVerifiedCutoverSource(options.sourceSnapshotPath, options.sourceManifestPath);
  if (finalSource.manifestSha256 !== initialSource.manifestSha256
    || finalSource.sourceSnapshotSha256 !== initialSource.sourceSnapshotSha256) {
    throw Object.assign(new Error('Verified cutover source changed'), { code: 'CUTOVER_SOURCE_INVALID' });
  }
  assertCutoverAuthorizationCurrent(authorization.authorization, {
    authorizationPath: options.authorizationPath!, ...authorizationContext, now: resolved.now(),
  });
  await validateCutoverEnvironment({
    targetUrl: options.targetUrl,
    tlsMode: options.tlsMode,
    caPath: options.caPath,
  });
  const verifiedSource = await openVerifiedCutoverSource(
    options.sourceSnapshotPath, finalSource.sourceSnapshotSha256,
  );
  try {
    assertCutoverAuthorizationCurrent(authorization.authorization, {
      authorizationPath: options.authorizationPath!, ...authorizationContext, now: resolved.now(),
    });
    const reservation = await resolved.reserveEvidence({
      outputDirectory: options.outputDirectory,
      runId: options.runId,
      authorizationBytes: authorization.bytes,
      authorizationSha256: authorization.sha256,
      manifestBytes: finalSource.manifestBytes,
      manifestSha256: finalSource.manifestSha256,
      now: started,
    });
    return await executeReservedCutover(
      options, resolved, reservation, verifiedSource, started,
      authorization.authorization, authorizationContext, [
        sourceCheck,
        manifestCheck,
        {
          id: 'authorization.valid', status: 'passed',
          expected: authorization.sha256, actual: authorization.sha256,
          message: 'Approved pre-cutover authorization is valid',
        },
        {
          id: 'authorization.sha256', status: 'passed',
          expected: authorization.sha256, actual: authorization.sha256,
          message: 'Authorization evidence hash is fixed',
        },
        {
          id: 'release.candidate', status: 'passed',
          expected: options.releaseCandidate, actual: options.releaseCandidate,
          message: 'Authorized release candidate matches the executing build',
        },
      ],
    );
  } finally {
    verifiedSource.close();
  }
}

export type { CutoverOptions };
export type { CutoverDependencies } from '../cutover/orchestrator';
