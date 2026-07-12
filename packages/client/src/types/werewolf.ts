export interface WerewolfRound {
  day?: number;
  phase?: string;
  night?: WerewolfNight;
  exile?: { id: string };
  idiotReveal?: { id: string };
  sheriffId?: string;
  sheriffBadge?: { status?: string; [key: string]: unknown };
  sheriffElection?: SheriffElection;
  sheriffTransfers?: Array<Record<string, unknown>>;
  votes?: Record<string, string>;
  voteTally?: Record<string, number>;
  speeches?: unknown[];
  selfDestruct?: { playerId?: string | number; text?: string; day?: number } | null;
  silencedPlayerId?: string | number | null;
  silenceReason?: string | null;
  knightDuel?: { actorId?: string | number; targetId?: string | number; targetFaction?: string; success?: boolean; reason?: string | null } | null;
  evilKnightTrigger?: { actorId?: string | number; trigger?: string; targetId?: string | number } | null;
  oldRogueDeath?: { id?: string | number; reason?: string; sourceAction?: string } | null;
  bearRoar?: { roaring?: boolean; adjacentWolfIds?: Array<string | number> } | null;
  crowCursedPlayerId?: string | number | null;
  bombmanBlast?: { actorId?: string | number; targetIds?: Array<string | number> } | null;
}

export interface WerewolfNight {
  escapeHunterIds?: Array<string | number>;
  escapeHunterSpeechOrder?: Array<string | number>;
  escapeHunterSpeeches?: { playerId?: string | number; text?: string; thinking?: string }[];
  escapeHunterChoices?: Record<string, string | number>;
  escapeHunterVoteTally?: Record<string, number>;
  escapeHunterTarget?: string | number | null;
  thickWolfArmorBreak?: { targetId: string | number } | null;
  deaths?: { id: string; reason?: string }[];
  wolfIds?: string[] | number[];
  wolfLeaderId?: string | number | null;
  wolfSpeechOrder?: (string | number)[];
  wolfSpeeches?: { playerId?: string | number; text?: string; thinking?: string }[];
  wolfSharedInfo?: string;
  wolfTarget?: string;
  wolfChoices?: Record<string, string>;
  seerCheck?: { target: string; result?: string; reason?: string | null };
  guardTarget?: string;
  guardReason?: string | null;
  witchSaveTarget?: string;
  witchSaveReason?: string | null;
  witchSave?: boolean;
  witchPoisonTarget?: string;
  witchPoisonReason?: string | null;
  butterflyTarget?: string | number | null;
  stalkerTarget?: string | number | null;
  wolfBeautyTarget?: string | number | null;
  demonInspect?: { target?: string | number | null; result?: string; reason?: string | null };
  nightmareTarget?: string | number | null;
  penguinFrozenId?: string | number | null;
  penguinReason?: string | null;
  foxInspect?: { targetIds?: Array<string | number>; hasWolf?: boolean; reason?: string | null } | null;
  dreamerTarget?: string | number | null;
  dreamerReason?: string | null;
  dreamerRepeatedTarget?: boolean;
  magicianSwap?: { firstTarget?: string | number | null; secondTarget?: string | number | null; reason?: string | null } | null;
  fortuneTellerMark?: { target?: string | number | null; reason?: string | null } | null;
  bigBadWolfTarget?: string | number | null;
  bigBadWolfReason?: string | null;
  crowCurse?: { target?: string | number | null; reason?: string | null } | null;
  blackMerchantGift?: { actorId?: string | number; targetId?: string | number; gift?: string; success?: boolean; reason?: string | null } | null;
  luckySeerCheck?: { actorId?: string | number; target?: string | number | null; result?: string; reason?: string | null } | null;
  luckyPoisonTarget?: string | number | null;
  luckyPoisonReason?: string | null;
  youngerBrotherTarget?: string | number | null;
  youngerBrotherReason?: string | null;
  wolfSeedInfect?: { actorId?: string | number; targetId?: string | number; used?: boolean; success?: boolean; reason?: string | null } | null;
  heavenlyEyeCheck?: { target?: string | number | null; roleId?: string; roleName?: string; reason?: string | null } | null;
  requesterPrayer?: { actorId?: string | number; targetId?: string | number; result?: string; reason?: string | null } | null;
  requesterTarget?: string | number | null;
  requesterReason?: string | null;
  thiefChoice?: { actorId?: string | number; roleId?: string; offeredRoleIds?: string[]; reason?: string | null } | null;
  loverLink?: { actorId?: string | number; targetIds?: Array<string | number>; source?: string; reason?: string | null } | null;
  succubusLink?: { actorId?: string | number; targetIds?: Array<string | number>; reason?: string | null } | null;
  ghostBrideLink?: { actorId?: string | number; partnerId?: string | number; witnessId?: string | number; reason?: string | null } | null;
  ghostBrideChat?: { playerId?: string | number; text?: string; day?: number; phase?: string; thinking?: string }[];
  ghostBrideTarget?: string | number | null;
  ghostBrideReason?: string | null;
  demonHunterTarget?: string | number | null;
  demonHunterReason?: string | null;
  spiritWolfLearn?: { actorId?: string | number; targetId?: string | number; learnedRole?: string; reason?: string | null } | null;
  spiritWolfInspect?: { target?: string | number | null; result?: string; reason?: string | null } | null;
  spiritWolfGuardTarget?: string | number | null;
  spiritWolfGuardReason?: string | null;
  spiritWolfAntidoteTarget?: string | number | null;
  spiritWolfAntidoteReason?: string | null;
  wolfWitchCurse?: { actorId?: string | number; targetId?: string | number; reason?: string | null } | null;
  illusionTarget?: string | number | null;
  illusionReason?: string | null;
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
  use?: boolean;
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
