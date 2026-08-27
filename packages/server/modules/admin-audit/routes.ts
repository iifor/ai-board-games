import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { listAudit } from './controller';
import { listAuditSchema } from './validator';

const router = Router();
router.get('/audit-logs', validate(listAuditSchema, 'query'), listAudit);

export default router;
