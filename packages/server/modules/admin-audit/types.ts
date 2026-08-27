import type { AdminAuditEntry } from '@ai-presenter/shared/types/apiTypes';

interface AdminAuditContext {
  actorAdminId: number | null;
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string;
}

interface AuditListInput {
  entityType?: string;
  entityId?: string;
  action?: string;
  limit: number;
  offset: number;
}

export type { AdminAuditContext, AdminAuditEntry, AuditListInput };
