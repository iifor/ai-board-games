export type ReadinessStage = 'preflight' | 'backup' | 'import' | 'validation' | 'rehearsal' | 'smoke' | 'release';
export type CheckStatus = 'passed' | 'failed' | 'skipped';
export type ArtifactType = 'backup' | 'manifest' | 'migration-report' | 'validation-report' | 'rehearsal-report' | 'smoke-report' | 'evidence';

export interface ReadinessCheck {
  id: string;
  status: CheckStatus;
  expected?: string;
  actual?: string;
  message: string;
}

export interface ReadinessArtifact {
  type: ArtifactType;
  path: string;
  sha256?: string;
}

export interface ReadinessReport {
  runId: string;
  schema?: string;
  stage: ReadinessStage;
  status: 'passed' | 'failed';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  checks: ReadinessCheck[];
  artifacts: ReadinessArtifact[];
  errors: Array<{ code: string; message: string }>;
}
