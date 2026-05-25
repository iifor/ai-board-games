export interface WerewolfRound {
  day?: number;
  phase?: string;
  night?: WerewolfNight;
  exile?: { id: string };
  idiotReveal?: { id: string };
  sheriffId?: string;
  sheriffElection?: SheriffElection;
  votes?: Record<string, string>;
  voteTally?: Record<string, number>;
  speeches?: unknown[];
}

export interface WerewolfNight {
  deaths?: { id: string; reason?: string }[];
  wolfTarget?: string;
  wolfChoices?: Record<string, string>;
  seerCheck?: { target: string; result?: string };
  guardTarget?: string;
  witchSaveTarget?: string;
  witchSave?: boolean;
  witchPoisonTarget?: string;
}

export interface SheriffElection {
  sheriffId?: string;
  result?: string;
  candidates?: string[];
  signedUpIds?: string[];
  votes?: Record<string, string>;
  runoffVotes?: Record<string, string>;
  withdrawnIds?: string[];
}

export interface WerewolfMode {
  id: string;
  name?: string;
  roles?: WerewolfModeRole[];
  sheriff?: { enabled?: boolean };
  winCondition?: string;
}

export interface WerewolfModeRole {
  roleId?: string;
  id?: string;
  roleName?: string;
  name?: string;
  count?: number;
  faction?: string;
}

export interface NightBadge {
  kind: string;
  target?: string;
  targetLabel?: string;
  prefix?: string;
  result?: string;
  theme?: NightBadgeTheme;
  title: string;
  label?: string;
}

export interface NightBadgeTheme {
  className: string;
  style: Record<string, string>;
}

export interface RoleConfigGroup {
  id: string;
  name: string;
  count: number;
  icon: React.ReactNode;
  details: { id: string; name: string; count: number }[];
}

export interface EventLogEntry {
  id: string;
  kind: string;
  title: string;
  text: string;
  icon: React.ReactNode;
}

export interface RoundProgressItem {
  key: string;
  phase: string;
  label: string;
  active: boolean;
}
