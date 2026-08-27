const API_CODES = {
  SUCCESS: 0,
  NOT_FOUND: -100001,
  VALIDATION_ERROR: -100002,
  UPSTREAM_ERROR: -100003,
  INTERNAL_ERROR: -100004
} as const;

const SUCCESS_RESPONSE = { code: 0, message: '操作成功' } as const;

type ApiResponse<T = unknown> = {
  code: number;
  message: string;
  data?: T;
};

type ApiData<T> = T extends ApiResponse<infer Data> ? Data : T;

interface GameVariant {
  id: number;
  gameType: string;
  variantKey: string;
  definitionVersion: string;
  name: string;
  description: string;
  configSchemaVersion: number;
  config: Record<string, unknown>;
  enabled: boolean;
  sortOrder: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

interface AdminAuditEntry {
  id: number;
  actorAdminId: number | null;
  action: string;
  entityType: string;
  entityId: string | null;
  requestId: string;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  userAgent: string;
  createdAt: string;
}

export { API_CODES, SUCCESS_RESPONSE };
export type { ApiResponse, ApiData, GameVariant, AdminAuditEntry };
