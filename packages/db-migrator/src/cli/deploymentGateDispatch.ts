import type { ParsedCommand } from './arguments';
import { verifyFreezeReceipt } from '../release/freezeReceipt';
import { verifyObservationReceipt } from '../release/observationReceipt';
import { verifyTrafficAuthorization } from '../release/trafficAuthorization';
import { recordProductionBuildReceipt } from '../release/recordProductionBuild';
import { verifyProductionBuildReceipt } from '../release/productionBuildReceipt';

type DeploymentGateCommand = 'record-production-build' | 'verify-production-build'
  | 'verify-freeze-receipt' | 'verify-traffic-authorization' | 'verify-observation-receipt';

export function isDeploymentGateCommand(command: ParsedCommand['command']): command is DeploymentGateCommand {
  return command === 'record-production-build' || command === 'verify-production-build'
    || command === 'verify-freeze-receipt'
    || command === 'verify-traffic-authorization' || command === 'verify-observation-receipt';
}

function required(parsed: ParsedCommand, name: string): string {
  const value = parsed.values.get(name);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

export async function runDeploymentGateCommand(command: DeploymentGateCommand, parsed: ParsedCommand) {
  if (command === 'record-production-build') {
    if (!parsed.execute) throw new Error('record-production-build requires --execute');
    return recordProductionBuildReceipt({
      outputPath: required(parsed, 'output'),
      buildId: required(parsed, 'build-id'),
      releaseCandidate: required(parsed, 'release-candidate'),
      candidateTree: required(parsed, 'candidate-tree'),
      toolingHead: required(parsed, 'tooling-head'),
      applicationInputManifestPath: required(parsed, 'application-input-manifest'),
      applicationInputManifestSha256: required(parsed, 'application-input-manifest-sha256'),
      runtimeImageDigest: required(parsed, 'runtime-image-digest'),
      opsImageDigest: required(parsed, 'ops-image-digest'),
    });
  }
  if (parsed.execute) throw new Error(`${command} is read-only and does not accept --execute`);
  if (command === 'verify-production-build') {
    const receiptSizeBytes = Number(required(parsed, 'receipt-size-bytes'));
    if (!Number.isSafeInteger(receiptSizeBytes) || receiptSizeBytes <= 0) throw new Error('invalid receipt size');
    return verifyProductionBuildReceipt({
      receiptPath: required(parsed, 'receipt'),
      receiptSha256: required(parsed, 'receipt-sha256'),
      receiptSizeBytes,
      releaseCandidate: required(parsed, 'release-candidate'),
      toolingHead: required(parsed, 'tooling-head'),
      runtimeImageDigest: required(parsed, 'runtime-image-digest'),
      opsImageDigest: required(parsed, 'ops-image-digest'),
      runtimeApplicationInputSha256: required(parsed, 'runtime-application-input-sha256'),
      expectedCandidateTree: required(parsed, 'candidate-tree'),
      expectedApplicationInputSha256: required(parsed, 'application-input-manifest-sha256'),
    });
  }
  if (command === 'verify-freeze-receipt') {
    return verifyFreezeReceipt({
      receiptPath: required(parsed, 'receipt'),
      receiptSha256: required(parsed, 'receipt-sha256'),
      releaseCandidate: required(parsed, 'release-candidate'),
      toolingHead: required(parsed, 'tooling-head'),
      freezeId: required(parsed, 'freeze-id'),
      sourceSqliteRelativePath: required(parsed, 'source-sqlite'),
      resourceRelativePaths: required(parsed, 'resources').split(','),
      goLiveOwner: required(parsed, 'go-live-owner'),
    });
  }
  if (command === 'verify-traffic-authorization') {
    return verifyTrafficAuthorization({
      authorizationPath: required(parsed, 'authorization'),
      releaseCandidate: required(parsed, 'release-candidate'),
      toolingHead: required(parsed, 'tooling-head'),
      runtimeImageDigest: required(parsed, 'runtime-image-digest'),
      opsImageDigest: required(parsed, 'ops-image-digest'),
      runtimeApplicationInputSha256: required(parsed, 'runtime-application-input-sha256'),
      expectedCandidateTree: required(parsed, 'candidate-tree'),
      expectedApplicationInputSha256: required(parsed, 'application-input-manifest-sha256'),
    });
  }
  return verifyObservationReceipt({
    observationPath: required(parsed, 'observation'),
    trafficAuthorizationPath: required(parsed, 'traffic-authorization'),
  });
}
