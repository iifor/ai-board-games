export interface Player {
  id: number;
  nickname?: string;
  name?: string;
  avatar?: string;
  avatarUrl?: string;
  avatar_url?: string;
  model?: string;
  modelName?: string;
  voicePackageId?: number | null;
  sex?: string;
  personality?: string;
  side?: 'pro' | 'con' | 'judge' | 'host';
  sideIndex?: number | null;
  sideLabel?: string;
  debateRole?: 'captain' | 'debater' | 'judge';
  debateRoleLabel?: string;
  position?: string;
  role?: string;
  roleLabel?: string;
  faction?: string;
  alive?: boolean;
  excluded?: boolean;
  provider?: string;
  deathDay?: number;
  deathReason?: string;
}

export interface HostOption {
  id: number | 'default';
  badge: string | number;
  name: string;
  description: string;
}
