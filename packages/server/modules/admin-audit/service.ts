import * as repository from './repository';
import type { AuditListInput } from './types';

function listAudit(input: AuditListInput) {
  return repository.listAudit(input);
}

export { listAudit };
