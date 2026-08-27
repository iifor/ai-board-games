import { z } from 'zod';

const listAuditSchema = z.object({
  entityType: z.string().trim().min(1).optional(),
  entityId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export { listAuditSchema };
