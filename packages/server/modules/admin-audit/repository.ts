import { getDbExecutor } from '../../db';
import type { DbExecutor } from '../../db/types';
import type { AdminAuditContext, AdminAuditEntry, AuditListInput } from './types';

interface AuditRow {
  id: number;
  actor_admin_id: number | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  request_id: string;
  before_json: unknown;
  after_json: unknown;
  ip_address: string | null;
  user_agent: string;
  created_at: string;
}

function mapRow(row: AuditRow): AdminAuditEntry {
  return {
    id: row.id,
    actorAdminId: row.actor_admin_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    requestId: row.request_id,
    before: row.before_json,
    after: row.after_json,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  };
}

async function appendAudit(
  context: AdminAuditContext,
  change: { action: string; entityType: string; entityId?: string | null; before?: unknown; after?: unknown },
  db: DbExecutor = getDbExecutor(),
): Promise<void> {
  await db.execute(`INSERT INTO admin_audit_log
    (actor_admin_id, action, entity_type, entity_id, request_id, before_json, after_json, ip_address, user_agent)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [context.actorAdminId, change.action, change.entityType,
    change.entityId || null, context.requestId, change.before ?? null, change.after ?? null,
    context.ipAddress || null, context.userAgent || '']);
}

async function listAudit(input: AuditListInput): Promise<AdminAuditEntry[]> {
  const rows = await getDbExecutor().queryMany<AuditRow>(`SELECT * FROM admin_audit_log
    WHERE ($1::text IS NULL OR entity_type = $1)
      AND ($2::text IS NULL OR entity_id = $2)
      AND ($3::text IS NULL OR action = $3)
    ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5`,
  [input.entityType || null, input.entityId || null, input.action || null, input.limit, input.offset]);
  return rows.map(mapRow);
}

export { appendAudit, listAudit };
