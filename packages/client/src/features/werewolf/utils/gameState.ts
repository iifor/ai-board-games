import type { GameEvent, GameState, WerewolfRound } from '../../../types';

type RecordValue = Record<string, unknown>;

function mergeWerewolfEventIntoGame(current: GameState, event: GameEvent): GameState {
  let next = event.game ? mergeWerewolfGameState(current, event.game) : current;

  if (event.players) {
    next = { ...next, players: event.players };
  }

  const eventRound = extractEventRound(event);
  if (eventRound) {
    next = mergeWerewolfGameState(next, { rounds: [eventRound] });
  }

  return next;
}

function mergeWerewolfGameState(current: GameState, incoming: GameState): GameState {
  const merged: GameState = {
    ...current,
    ...incoming,
    players: incoming.players || current.players,
    rounds: mergeRounds(current.rounds || [], incoming.rounds || []),
  };
  return merged;
}

function resolveActiveSheriffId(rounds: WerewolfRound[] = [], currentRound?: WerewolfRound | null): string | number | null {
  const ordered = currentRound
    ? [...rounds.filter((round) => round !== currentRound), currentRound]
    : rounds;

  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const round = ordered[index];
    const transfer = getLatestSheriffTransfer(round);
    if (transfer) {
      if (String(transfer.action || '') === 'tear') return null;
      if (transfer.to != null) return transfer.to as string | number;
    }

    const badgeStatus = String((round.sheriffBadge as RecordValue | undefined)?.status || '');
    if (badgeStatus === 'torn') return null;
    if (round.sheriffId != null && String(round.sheriffId) !== '') return round.sheriffId;
    if (round.sheriffElection?.sheriffId != null && String(round.sheriffElection.sheriffId) !== '') {
      return round.sheriffElection.sheriffId;
    }
  }

  return null;
}

function mergeRounds(currentRounds: WerewolfRound[], incomingRounds: WerewolfRound[]): WerewolfRound[] {
  if (!incomingRounds.length) return currentRounds;
  const byDay = new Map<number, WerewolfRound>();
  currentRounds.forEach((round, index) => {
    byDay.set(roundKey(round, index), round);
  });
  incomingRounds.forEach((round, index) => {
    const key = roundKey(round, currentRounds.length + index);
    byDay.set(key, mergeRound(byDay.get(key), round));
  });
  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, round]) => round);
}

function mergeRound(current: WerewolfRound | undefined, incoming: WerewolfRound): WerewolfRound {
  if (!current) return incoming;
  return {
    ...current,
    ...incoming,
    night: mergeObject(current.night, incoming.night) as WerewolfRound['night'],
    sheriffBadge: mergeObject(current.sheriffBadge as RecordValue | undefined, incoming.sheriffBadge as RecordValue | undefined),
    sheriffElection: mergeObject(current.sheriffElection as RecordValue | undefined, incoming.sheriffElection as RecordValue | undefined) as WerewolfRound['sheriffElection'],
    votes: mergeObject(current.votes, incoming.votes) as WerewolfRound['votes'],
    voteTally: mergeObject(current.voteTally, incoming.voteTally) as WerewolfRound['voteTally'],
  };
}

function extractEventRound(event: GameEvent): WerewolfRound | null {
  const baseRound = event.round ? { ...event.round } : {};
  const metadata = event.metadata as { day?: unknown; phase?: unknown } | undefined;
  const day = Number(baseRound.day || metadata?.day);
  const patch: WerewolfRound = {
    ...baseRound,
    ...(Number.isFinite(day) && day > 0 ? { day } : {}),
    ...(typeof metadata?.phase === 'string' && !baseRound.phase ? { phase: metadata.phase } : {}),
  };

  if (event.type === 'vote-result') {
    const votes = readRecord(event, 'votes');
    const tally = readRecord(event, 'tally') || readRecord(event, 'voteTally');
    if (votes) patch.votes = votes as Record<string, string>;
    if (tally) patch.voteTally = tally as Record<string, number>;
    if (hasOwn(event, 'exile')) patch.exile = (event.exile || null) as WerewolfRound['exile'];
  }

  if (event.type === 'wolf-vote') {
    patch.night = {
      ...(baseRound.night || {}),
      ...(hasOwn(event, 'wolfTarget') ? { wolfTarget: event.wolfTarget == null ? undefined : String(event.wolfTarget) } : {}),
      ...(hasOwn(event, 'wolfChoices') ? { wolfChoices: event.wolfChoices as Record<string, string> } : {}),
      ...(hasOwn(event, 'wolfVoteTally') ? { wolfVoteTally: event.wolfVoteTally as Record<string, number> } : {}),
    };
  }

  if (event.type === 'seer-check' && event.seerCheck) {
    patch.night = {
      ...(baseRound.night || {}),
      seerCheck: event.seerCheck,
    };
  }

  if (event.type === 'witch-action' && event.witchAction) {
    patch.night = {
      ...(baseRound.night || {}),
      witchPoisonTarget: event.witchAction.use && event.witchAction.target != null
        ? String(event.witchAction.target)
        : undefined,
    };
  }

  if (event.type.startsWith('sheriff-')) {
    const election = readRecord(event, 'election') || readRecord(event, 'sheriffElection');
    if (election) patch.sheriffElection = election as WerewolfRound['sheriffElection'];
    if (hasOwn(event, 'sheriffId')) patch.sheriffId = event.sheriffId as string;
    if (hasOwn(event, 'sheriffBadge')) {
      patch.sheriffBadge = event.sheriffBadge as WerewolfRound['sheriffBadge'];
    }
    const transfer = readRecord(event, 'sheriffTransfer');
    if (transfer) {
      patch.sheriffTransfers = [...((baseRound as RecordValue).sheriffTransfers as unknown[] || []), transfer] as unknown as WerewolfRound['sheriffTransfers'];
      if (String(transfer.action || '') === 'transfer' && transfer.to != null) patch.sheriffId = transfer.to as string;
      if (String(transfer.action || '') === 'tear') patch.sheriffId = undefined;
    }
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

function mergeObject(current: unknown, incoming: unknown): RecordValue | undefined {
  if (!isRecord(incoming)) return isRecord(current) ? current : undefined;
  if (!isRecord(current)) return incoming;
  return { ...current, ...incoming };
}

function readRecord(event: GameEvent, key: string): RecordValue | null {
  const value = event[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getLatestSheriffTransfer(round: WerewolfRound | undefined): RecordValue | null {
  const transfers = (round as RecordValue | undefined)?.sheriffTransfers;
  if (!Array.isArray(transfers) || !transfers.length) return null;
  const latest = transfers[transfers.length - 1];
  return latest && typeof latest === 'object' ? latest as RecordValue : null;
}

function roundKey(round: WerewolfRound, fallback: number): number {
  const day = Number(round.day);
  return Number.isFinite(day) && day > 0 ? day : fallback + 1;
}

export {
  mergeWerewolfEventIntoGame,
  mergeWerewolfGameState,
  resolveActiveSheriffId,
};
