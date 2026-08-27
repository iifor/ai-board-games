import type { AdminAuditContext } from '../admin-audit';
import type { GameVariant } from '@ai-presenter/shared/types/apiTypes';

interface GameVariantInput {
  gameType: string;
  variantKey: string;
  definitionVersion: string;
  name: string;
  description?: string;
  configSchemaVersion?: number;
  config?: Record<string, unknown>;
  enabled?: boolean;
  sortOrder?: number;
}

interface GameVariantUpdate extends Partial<GameVariantInput> {
  revision: number;
}

interface VariantMutationContext {
  audit: AdminAuditContext;
}

export type { GameVariant, GameVariantInput, GameVariantUpdate, VariantMutationContext };
