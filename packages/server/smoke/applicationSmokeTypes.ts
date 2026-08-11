import type { DbExecutor } from '../db/types';

interface ApplicationSmokeAdapterRequest {
  runId: string;
  targetUrl: string;
  targetSchema: string;
  purpose?: 'production-cutover';
}

interface ApplicationSmokeCheck {
  id: string;
  status: 'passed' | 'failed';
  expected?: string;
  actual?: string;
  message: string;
}

interface ApplicationSmokeAdapterResponse {
  ok: boolean;
  schema?: string;
  checks: ApplicationSmokeCheck[];
  errors: Array<{ code: string; message: string }>;
}

interface SmokeRuntime {
  baseUrl: string;
  database: DbExecutor;
  adminUsername: string;
  adminPassword: string;
  disconnectHealthProbe(): Promise<void>;
  close(): Promise<void>;
}

export type {
  ApplicationSmokeAdapterRequest,
  ApplicationSmokeAdapterResponse,
  ApplicationSmokeCheck,
  SmokeRuntime,
};
