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

  if (event.type === 'guard-action' && event.guardAction) {
    patch.night = {
      ...(baseRound.night || {}),
      guardTarget: event.guardAction.target == null ? undefined : String(event.guardAction.target),
      ...(event.guardAction.reason ? { guardReason: event.guardAction.reason } : {}),
    };
  }

  if (event.type === 'witch-action' && event.witchAction) {
    if (event.actionType === 'witch_save') {
      patch.night = {
        ...(baseRound.night || {}),
        witchSave: event.witchAction.use === true,
        witchSaveTarget: event.witchAction.use && event.witchAction.target != null
          ? String(event.witchAction.target)
          : undefined,
        ...(event.witchAction.use && event.witchAction.reason
          ? { witchSaveReason: event.witchAction.reason }
          : {}),
      };
    } else {
      patch.night = {
        ...(baseRound.night || {}),
        witchPoisonTarget: event.witchAction.use && event.witchAction.target != null
          ? String(event.witchAction.target)
          : undefined,
        ...(event.witchAction.use && event.witchAction.reason
          ? { witchPoisonReason: event.witchAction.reason }
          : {}),
      };
    }
  }

  if (event.type === 'escape-hunter-vote') {
    patch.night = {
      ...(baseRound.night || {}),
      escapeHunterTarget: event.escapeHunterTarget ?? null,
      escapeHunterChoices: event.escapeHunterChoices || {},
      escapeHunterVoteTally: event.escapeHunterVoteTally || {},
    };
  }

  if (event.type === 'thick-wolf-armor' && event.targetId != null) {
    patch.night = {
      ...(baseRound.night || {}),
      ...(patch.night || {}),
      thickWolfArmorBreak: { targetId: event.targetId },
    };
  }

  if (event.type === 'silence-result') {
    if (hasOwn(event, 'silencedPlayerId')) patch.silencedPlayerId = event.silencedPlayerId as string | number | null;
    if (event.reason) patch.silenceReason = event.reason;
  }

  if (event.type === 'knight-duel' && event.knightDuel) {
    patch.knightDuel = event.knightDuel as WerewolfRound['knightDuel'];
  }

  if (event.type === 'butterfly-hug' && hasOwn(event, 'butterflyTarget')) {
    patch.night = { ...(patch.night || {}), butterflyTarget: event.butterflyTarget as string | number | null };
  }

  if (event.type === 'stalker-assassinate' && hasOwn(event, 'stalkerTarget')) {
    patch.night = { ...(patch.night || {}), stalkerTarget: event.stalkerTarget as string | number | null };
  }

  if (event.type === 'wolf-beauty-charm' && hasOwn(event, 'wolfBeautyTarget')) {
    patch.night = { ...(patch.night || {}), wolfBeautyTarget: event.wolfBeautyTarget as string | number | null };
  }

  if (event.type === 'demon-inspect' && event.demonInspect) {
    patch.night = { ...(patch.night || {}), demonInspect: event.demonInspect };
  }

  if (event.type === 'nightmare-fear' && hasOwn(event, 'nightmareTarget')) {
    patch.night = { ...(patch.night || {}), nightmareTarget: event.nightmareTarget as string | number | null };
  }

  if (event.type === 'dreamer-dream' && hasOwn(event, 'dreamerTarget')) {
    patch.night = { ...(patch.night || {}), dreamerTarget: event.dreamerTarget as string | number | null };
  }

  if (event.type === 'magician-swap' && hasOwn(event, 'magicianSwap')) {
    patch.night = { ...(patch.night || {}), magicianSwap: event.magicianSwap as NonNullable<WerewolfRound['night']>['magicianSwap'] };
  }

  if (event.type === 'fortune-teller-mark' && hasOwn(event, 'fortuneTellerMark')) {
    patch.night = { ...(patch.night || {}), fortuneTellerMark: event.fortuneTellerMark as NonNullable<WerewolfRound['night']>['fortuneTellerMark'] };
  }

  if (event.type === 'big-bad-wolf-kill' && hasOwn(event, 'bigBadWolfTarget')) {
    patch.night = {
      ...(patch.night || {}),
      bigBadWolfTarget: event.bigBadWolfTarget as string | number | null,
      ...(event.reason ? { bigBadWolfReason: event.reason } : {}),
    };
  }

  if (event.type === 'crow-curse' && hasOwn(event, 'crowCurse')) {
    const crowCurse = event.crowCurse as NonNullable<WerewolfRound['night']>['crowCurse'];
    patch.night = { ...(patch.night || {}), crowCurse };
    patch.crowCursedPlayerId = crowCurse?.target ?? null;
  }

  if (event.type === 'black-merchant-gift' && hasOwn(event, 'blackMerchantGift')) {
    patch.night = { ...(patch.night || {}), blackMerchantGift: event.blackMerchantGift as NonNullable<WerewolfRound['night']>['blackMerchantGift'] };
  }

  if (event.type === 'lucky-seer-check' && hasOwn(event, 'luckySeerCheck')) {
    patch.night = { ...(patch.night || {}), luckySeerCheck: event.luckySeerCheck as NonNullable<WerewolfRound['night']>['luckySeerCheck'] };
  }

  if (event.type === 'lucky-witch-poison' && hasOwn(event, 'luckyPoisonTarget')) {
    patch.night = {
      ...(patch.night || {}),
      luckyPoisonTarget: event.luckyPoisonTarget as string | number | null,
      ...(event.reason ? { luckyPoisonReason: event.reason } : {}),
    };
  }

  if (event.type === 'younger-brother-kill' && hasOwn(event, 'youngerBrotherTarget')) {
    patch.night = {
      ...(patch.night || {}),
      youngerBrotherTarget: event.youngerBrotherTarget as string | number | null,
      ...(event.reason ? { youngerBrotherReason: event.reason } : {}),
    };
  }

  if (event.type === 'ghost-bride-link' && hasOwn(event, 'ghostBrideLink')) {
    patch.night = { ...(patch.night || {}), ghostBrideLink: event.ghostBrideLink as NonNullable<WerewolfRound['night']>['ghostBrideLink'] };
  }

  if (event.type === 'ghost-bride-chat' && hasOwn(event, 'ghostBrideChat')) {
    patch.night = { ...(patch.night || {}), ghostBrideChat: event.ghostBrideChat as NonNullable<WerewolfRound['night']>['ghostBrideChat'] };
  }

  if (event.type === 'ghost-bride-kill' && hasOwn(event, 'ghostBrideTarget')) {
    patch.night = {
      ...(patch.night || {}),
      ghostBrideTarget: event.ghostBrideTarget as string | number | null,
      ...(event.reason ? { ghostBrideReason: event.reason } : {}),
    };
  }

  if (event.type === 'demon-hunter-hunt' && hasOwn(event, 'demonHunterTarget')) {
    patch.night = {
      ...(patch.night || {}),
      demonHunterTarget: event.demonHunterTarget as string | number | null,
      ...(event.reason ? { demonHunterReason: event.reason } : {}),
    };
  }

  if (event.type === 'spirit-wolf-learn' && hasOwn(event, 'spiritWolfLearn')) {
    patch.night = { ...(patch.night || {}), spiritWolfLearn: event.spiritWolfLearn as NonNullable<WerewolfRound['night']>['spiritWolfLearn'] };
  }

  if (event.type === 'spirit-wolf-inspect' && hasOwn(event, 'spiritWolfInspect')) {
    patch.night = { ...(patch.night || {}), spiritWolfInspect: event.spiritWolfInspect as NonNullable<WerewolfRound['night']>['spiritWolfInspect'] };
  }

  if (event.type === 'spirit-wolf-guard' && hasOwn(event, 'spiritWolfGuardTarget')) {
    patch.night = {
      ...(patch.night || {}),
      spiritWolfGuardTarget: event.spiritWolfGuardTarget as string | number | null,
      ...(event.reason ? { spiritWolfGuardReason: event.reason } : {}),
    };
  }

  if (event.type === 'spirit-wolf-antidote' && hasOwn(event, 'spiritWolfAntidoteTarget')) {
    patch.night = {
      ...(patch.night || {}),
      spiritWolfAntidoteTarget: event.spiritWolfAntidoteTarget as string | number | null,
      ...(event.reason ? { spiritWolfAntidoteReason: event.reason } : {}),
    };
  }

  if (event.type === 'wolf-witch-curse' && hasOwn(event, 'wolfWitchCurse')) {
    patch.night = { ...(patch.night || {}), wolfWitchCurse: event.wolfWitchCurse as NonNullable<WerewolfRound['night']>['wolfWitchCurse'] };
  }

  if (event.type === 'illusionist-illusion' && hasOwn(event, 'illusionTarget')) {
    patch.night = {
      ...(patch.night || {}),
      illusionTarget: event.illusionTarget as string | number | null,
      ...(event.reason ? { illusionReason: event.reason } : {}),
    };
  }

  if (event.type === 'penguin-freeze' && hasOwn(event, 'penguinFrozenId')) {
    patch.night = {
      ...(patch.night || {}),
      penguinFrozenId: event.penguinFrozenId as string | number | null,
      ...(event.reason ? { penguinReason: event.reason } : {}),
    };
  }

  if (event.type === 'fox-inspect' && hasOwn(event, 'foxInspect')) {
    patch.night = { ...(patch.night || {}), foxInspect: event.foxInspect as NonNullable<WerewolfRound['night']>['foxInspect'] };
  }

  if (event.type === 'bear-tamer-roar' && hasOwn(event, 'bearRoar')) {
    patch.bearRoar = event.bearRoar as WerewolfRound['bearRoar'];
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

  if (event.type === 'idiot-reveal' && event.idiotReveal) {
    patch.idiotReveal = event.idiotReveal as WerewolfRound['idiotReveal'];
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

function canSubmitWerewolfSetup(input: {
  modeId?: string | null;
  selectedCount: number;
  requiredCount: number;
  availableCount?: number;
  debugMode?: boolean;
}): boolean {
  if (!input.modeId) return false;
  if (input.debugMode) return input.selectedCount === input.requiredCount || Number(input.availableCount || 0) >= input.requiredCount;
  return input.selectedCount === input.requiredCount;
}

export {
  canSubmitWerewolfSetup,
  mergeWerewolfEventIntoGame,
  mergeWerewolfGameState,
  resolveActiveSheriffId,
};
