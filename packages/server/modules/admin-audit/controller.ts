import type { Request, Response } from 'express';
import { formatSuccess } from '../../utils/response';
import * as service from './service';
import type { AuditListInput } from './types';

async function listAudit(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.listAudit(req.query as unknown as AuditListInput)));
}

export { listAudit };
