type NightResolutionAuditStatus = 'matched' | 'mismatched' | 'audit_failed' | 'unknown';

interface WorkflowEventLike {
  id?: string | number;
  seq?: number;
  type?: string;
  payload?: unknown;
}

interface NightResolutionAuditRow {
  key: string;
  seq?: number;
  day?: number;
  status: NightResolutionAuditStatus;
  mismatchFields: string[];
  legacyDeaths: unknown[];
  engineDeaths: unknown[];
  payload: Record<string, unknown>;
}

interface NightResolutionAuditSummary {
  total: number;
  matched: number;
  mismatched: number;
  auditFailed: number;
  unknown: number;
  latestStatus: NightResolutionAuditStatus;
}

const NIGHT_RESOLUTION_AUDIT_EVENT = 'werewolf_night_resolution_shadow_audited';

function getNightResolutionAuditRows(events: WorkflowEventLike[] = []): NightResolutionAuditRow[] {
  return events
    .filter((event) => event.type === NIGHT_RESOLUTION_AUDIT_EVENT)
    .map((event, index) => {
      const payload = toRecord(event.payload);
      const legacy = toRecord(payload.legacy);
      const engine = toRecord(payload.engine);
      return {
        key: String(event.id ?? event.seq ?? index),
        seq: event.seq,
        day: toOptionalNumber(payload.day),
        status: normalizeStatus(payload.status),
        mismatchFields: normalizeMismatchFields(payload.mismatches),
        legacyDeaths: normalizeArray(legacy.deaths),
        engineDeaths: normalizeArray(engine.deaths),
        payload,
      };
    });
}

function summarizeNightResolutionAudits(rows: NightResolutionAuditRow[] = []): NightResolutionAuditSummary {
  const summary: NightResolutionAuditSummary = {
    total: rows.length,
    matched: 0,
    mismatched: 0,
    auditFailed: 0,
    unknown: 0,
    latestStatus: 'unknown',
  };
  for (const row of rows) {
    if (row.status === 'matched') summary.matched += 1;
    else if (row.status === 'mismatched') summary.mismatched += 1;
    else if (row.status === 'audit_failed') summary.auditFailed += 1;
    else summary.unknown += 1;
  }
  summary.latestStatus = rows.length ? rows[rows.length - 1].status : 'unknown';
  return summary;
}

function normalizeStatus(value: unknown): NightResolutionAuditStatus {
  if (value === 'matched' || value === 'mismatched' || value === 'audit_failed') return value;
  return 'unknown';
}

function normalizeMismatchFields(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toRecord(item).field)
    .filter((field): field is string => typeof field === 'string' && Boolean(field));
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toOptionalNumber(value: unknown): number | undefined {
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export {
  NIGHT_RESOLUTION_AUDIT_EVENT,
  getNightResolutionAuditRows,
  summarizeNightResolutionAudits,
};

export type {
  NightResolutionAuditRow,
  NightResolutionAuditStatus,
  NightResolutionAuditSummary,
  WorkflowEventLike,
};
