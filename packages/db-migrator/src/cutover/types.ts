export const CUTOVER_TARGET = {
  database: 'consensus',
  schema: 'consensus',
  role: 'consensus_migrator',
  host: 'postgres',
  port: 5432,
  tlsMode: 'verify-full',
} as const;

export const CUTOVER_APPROVAL_ROLES = [
  'go-live-owner',
  'rollback-owner',
  'independent-reviewer',
] as const;

export interface CutoverApproval {
  role: typeof CUTOVER_APPROVAL_ROLES[number];
  name: string;
  approvedAt: string;
}

export interface CutoverAuthorization {
  version: 1;
  purpose: 'production-cutover';
  status: 'approved';
  approved: true;
  releaseCandidate: string;
  cutoverRunId: string;
  backupManifestSha256: string;
  sourceSnapshotSha256: string;
  freezeReceiptSha256: string;
  target: typeof CUTOVER_TARGET;
  maintenanceWindow: { startsAt: string; endsAt: string };
  approvals: [CutoverApproval, CutoverApproval, CutoverApproval];
}

export interface LoadCutoverAuthorizationOptions {
  authorizationPath: string;
  runId: string;
  releaseCandidate: string;
  manifestSha256: string;
  sourceSnapshotSha256: string;
  freezeReceiptSha256: string;
  now: Date;
}

export interface LoadedCutoverAuthorization {
  authorization: CutoverAuthorization;
  resolvedPath: string;
  sizeBytes: number;
  sha256: string;
  bytes: Buffer;
}

export interface CutoverOptions {
  runId: string;
  sourceSnapshotPath: string;
  sourceManifestPath: string;
  authorizationPath?: string;
  outputDirectory: string;
  execute: boolean;
  targetUrl: string;
  releaseCandidate: string;
  tlsMode: string;
  caPath: string;
  freezeReceiptSha256: string;
}
