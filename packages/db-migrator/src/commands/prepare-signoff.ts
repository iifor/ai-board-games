import path from 'node:path';
import { isSafeRunId } from '../backup/publication';
import { buildSignoffDraft, type PrepareEvidenceOptions } from '../release/prepareSignoff';
import { writeJsonArtifactExclusive } from '../reporting/reportWriter';
import type { ReadinessReport } from '../reporting/reportTypes';

const GIT_SHA = /^[a-f0-9]{40}$/;

export interface PrepareSignoffResult { report: ReadinessReport; draftPath: string }

function validate(options: PrepareEvidenceOptions): void {
  const owners = [options.goLiveOwner.trim(), options.rollbackOwner.trim()];
  if (!isSafeRunId(options.runId) || !GIT_SHA.test(options.releaseCandidate)
    || /^0{40}$/.test(options.releaseCandidate) || !options.reportPaths.length
    || !options.outputDirectory.trim() || owners.some((owner) => !owner)
    || owners[0].toLowerCase() === owners[1].toLowerCase()) {
    throw Object.assign(new Error('Prepare signoff parameters are invalid'), { code: 'PREPARE_SIGNOFF_PARAMETERS_INVALID' });
  }
}

export async function runPrepareSignoff(options: PrepareEvidenceOptions): Promise<PrepareSignoffResult> {
  validate(options);
  const started = Date.now();
  const draft = await buildSignoffDraft(options);
  const draftPath = path.join(path.resolve(options.outputDirectory), `${options.runId}-operator-signoff.pending.json`);
  await writeJsonArtifactExclusive({ finalPath: draftPath, payload: draft });
  const finished = Date.now();
  return {
    draftPath,
    report: {
      runId: options.runId,
      stage: 'release',
      status: 'passed',
      startedAt: new Date(started).toISOString(),
      finishedAt: new Date(finished).toISOString(),
      durationMs: finished - started,
      checks: [{ id: 'operator.signoff-draft', status: 'passed', message: 'Pending operator signoff draft created from stable evidence' }],
      artifacts: [{ type: 'evidence', path: path.basename(draftPath) }],
      errors: [],
    },
  };
}
