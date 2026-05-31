import { getGame } from '../games';
import { listPlayers } from '../players';
import { getWerewolfModeConfig } from '../werewolf-config';
import { createPreparedSender } from './sender';
import { isSessionCancelled } from './session';
import type { GameSession } from './session';
import type { PreparedSender } from './sender';
import {
  createProjectionContext,
  projectWerewolfEvent,
  projectWerewolfGame,
  projectPlayers,
} from '../werewolf/views/viewPolicy';
import {
  buildDayStartMessage,
  buildNightPublicMessage,
  buildSheriffStartMessage,
  buildSheriffResultMessage,
  getWerewolfNightPrompt,
} from '../werewolf/announcements';

// --- Interfaces ---

interface ReplayPlayer {
  id?: number | string;
  role?: string;
  faction?: string;
  alive?: boolean;
  deathDay?: number | string | null;
  deathReason?: string;
  lastWords?: unknown[];
  avatar?: string;
  avatarUrl?: string;
  voicePackageId?: number | string | null;
  personality?: string;
  sex?: string;
  seerChecks?: unknown[];
  [key: string]: unknown;
}

interface WerewolfNight {
  wolfTarget?: number | string | null;
  wolfLeaderId?: number | string | null;
  wolfSpeechOrder?: unknown[];
  wolfSpeeches?: unknown[];
  wolfChoices?: Record<string, unknown>;
  wolfVoteTally?: Record<string, number>;
  wolfTieBreak?: unknown;
  seerCheck?: { target?: string; result?: string; [key: string]: unknown } | null;
  witchSave?: boolean;
  witchSaveTarget?: number | string | null;
  witchPoisonTarget?: number | string | null;
  guardTarget?: number | string | null;
  deaths?: Array<{ id?: number | string; playerId?: number | string; reason?: string; deathReason?: string }>;
  [key: string]: unknown;
}

interface SheriffElection {
  signedUpIds?: number[];
  candidates?: number[];
  speeches?: unknown[];
  withdrawnIds?: number[];
  voters?: number[];
  votes?: Record<string, unknown>;
  tally?: Record<string, number>;
  runoffCandidateIds?: number[];
  runoffSpeechOrder?: unknown[];
  runoffSpeeches?: unknown[];
  runoffVotes?: Record<string, unknown>;
  runoffTally?: Record<string, number>;
  sheriffId?: number | string | null;
  result?: string;
  [key: string]: unknown;
}

interface SheriffTransfer {
  phase?: string;
  action?: string;
  to?: number | string;
  [key: string]: unknown;
}

interface SpeechData {
  playerId?: number | string;
  player_id?: number | string;
  id?: number | string;
  text?: string;
  content?: string;
  message?: string;
  side?: string;
  speakerLabel?: string;
  [key: string]: unknown;
}

interface DaySpeechData {
  source?: string;
  anchorPlayerId?: boolean;
  direction?: string;
  startPlayerId?: number | string;
  [key: string]: unknown;
}

interface ExileData {
  id?: number | string;
  playerId?: number | string;
  deathReason?: string;
  reason?: string;
  [key: string]: unknown;
}

interface HunterShotData {
  target?: number | string;
  [key: string]: unknown;
}

interface WerewolfRound {
  day?: number;
  number?: number;
  phase?: string;
  id?: string;
  title?: string;
  name?: string;
  night?: WerewolfNight;
  speeches?: SpeechData[];
  items?: SpeechData[];
  discussion?: SpeechData[];
  votes?: Record<string, unknown>;
  voteTally?: Record<string, number>;
  exile?: ExileData | null;
  idiotReveal?: unknown;
  hunterShot?: HunterShotData | null;
  sheriffId?: number | string | null;
  sheriffBadge?: { status?: string; [key: string]: unknown };
  sheriffElection?: SheriffElection | null;
  sheriffTransfers?: SheriffTransfer[];
  daySpeech?: DaySpeechData | null;
  lastWords?: TestimonyData[];
  testimonies?: TestimonyData[];
  nightRevealed?: boolean;
  [key: string]: unknown;
}

interface TestimonyData {
  playerId?: number | string;
  id?: number | string;
  text?: string;
  testimony?: string;
  content?: string;
  [key: string]: unknown;
}

interface DebatePhase {
  id?: string;
  phase?: string;
  name?: string;
  title?: string;
  speeches?: SpeechData[];
  [key: string]: unknown;
}

interface WerewolfModeConfig {
  resolvedRoles?: Array<{ rule?: { actions?: Array<{ action?: string }> } }>;
  [key: string]: unknown;
}

interface ReplayGame {
  id?: string;
  type?: string;
  gameType?: string;
  winner?: string | null;
  winReason?: string;
  mvp?: unknown;
  topic?: unknown;
  players?: ReplayPlayer[];
  rounds?: WerewolfRound[];
  phases?: DebatePhase[];
  werewolfMode?: Record<string, unknown>;
  clientViewMode?: string;
  shareReport?: unknown;
  [key: string]: unknown;
}

interface ReplayOptions {
  replayView?: Record<string, unknown>;
  [key: string]: unknown;
}

interface PlaybackSnapshot extends ReplayGame {
  rounds?: Array<{
    number?: number;
    phase?: string;
    title?: string;
    speeches?: SpeechData[];
    [key: string]: unknown;
  }>;
}

// --- Main function ---

async function replayGameSession(
  session: GameSession,
  gameType: string,
  replayGameId: string,
  options: ReplayOptions = {},
): Promise<void> {
  const game = getGame(replayGameId) as unknown as ReplayGame | null;
  if (!game) throw new Error('历史对局不存在。');
  if (normalizeGameType(game.gameType || game.type) !== gameType)
    throw new Error('历史对局类型与当前游戏不匹配。');
  const replayGame = enrichReplayPlayers(normalizeReplayGame(game));
  const sender = createPreparedSender(
    session,
    gameType === 'debate' ? { phaseLookahead: 1 } : { prefetchCount: 2 },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const replayProjection =
    gameType === 'werewolf'
      ? createProjectionContext(replayGame as any, options.replayView || {})
      : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const replayPlayers: any[] =
    gameType === 'werewolf'
      ? createWerewolfReplayPlayers(replayGame.players || [])
      : replayGame.players || [];
  await sender.send({
    type: 'players',
    players: replayProjection
      ? projectPlayers(replayPlayers, replayProjection)
      : replayPlayers,
    game: replayProjection
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? projectWerewolfGame(getPlaybackGameSnapshot(replayGame) as any, replayProjection)
      : getPlaybackGameSnapshot(replayGame),
  });
  for (const event of buildReplayPlaybackEvents(replayGame)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const projected = replayProjection
      ? projectWerewolfEvent(event as any, replayProjection)
      : event;
    if (projected) await sender.enqueue(projected);
  }
  await sender.flush();
  await sender.send({
    type: 'game',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    game: replayProjection ? projectWerewolfGame(replayGame as any, replayProjection) : replayGame,
  });
  session.close();
}

// --- Normalization ---

function normalizeReplayGame(game: ReplayGame): ReplayGame {
  if (game.gameType === 'debate') {
    return {
      ...game,
      type: 'debate',
      phases: Array.isArray(game.phases)
        ? game.phases
        : getDebatePhasesFromRounds(game.rounds || []),
    };
  }
  return { ...game, type: game.gameType || game.type || 'werewolf' };
}

function enrichReplayPlayers(game: ReplayGame): ReplayGame {
  const latestPlayers = new Map(
    listPlayers().map((player) => [Number(player.id), player]),
  );
  const players = (game.players || []).map((player) => {
    const latest = latestPlayers.get(Number(player.id));
    if (!latest) return player;
    return {
      ...player,
      avatar: latest.avatar || player.avatar || '',
      avatarUrl: latest.avatar || player.avatarUrl || player.avatar || '',
      voicePackageId: latest.voicePackageId || player.voicePackageId || null,
      personality: latest.personality || player.personality || '',
      sex: latest.sex || player.sex || '',
    };
  });
  return { ...game, players };
}

function getPlaybackGameSnapshot(
  game: ReplayGame,
  phases: DebatePhase[] = [],
): PlaybackSnapshot {
  if (!game) return game as PlaybackSnapshot;
  return {
    ...game,
    phases,
    rounds: phases.map((phase, index) => ({
      number: index + 1,
      phase: phase.id,
      title: phase.name,
      speeches: phase.speeches || [],
    })),
    winner: null,
    mvp: null,
    winReason: '',
    shareReport: null,
  };
}

// --- Event builders ---

function buildReplayPlaybackEvents(game: ReplayGame): Record<string, unknown>[] {
  if (game.type === 'werewolf') return buildWerewolfReplayPlaybackEvents(game);
  if (game.type === 'debate') {
    const events: Record<string, unknown>[] = [];
    const playedPhases: DebatePhase[] = [];
    for (const phase of game.phases || []) {
      const currentPhase: DebatePhase = { ...phase, speeches: [] };
      const phaseName = currentPhase.name || '下一';
      events.push({
        type: 'phase-start',
        phase: currentPhase,
        message: `现在进入${phaseName}环节。`,
        game: getPlaybackGameSnapshot(game, [...playedPhases, currentPhase]),
      });
      for (const speech of getRoundSpeeches(phase)) {
        const normalizedSpeech = normalizeDebateSpeech(speech);
        currentPhase.speeches!.push(normalizedSpeech);
        events.push({
          type: 'speech',
          phase: currentPhase,
          speech: normalizedSpeech,
          game: getPlaybackGameSnapshot(game, [...playedPhases, currentPhase]),
        });
      }
      events.push({
        type: 'phase-end',
        phase: currentPhase,
        message: `${phaseName}环节结束。`,
        game: getPlaybackGameSnapshot(game, [...playedPhases, currentPhase]),
      });
      playedPhases.push(currentPhase);
    }
    return events;
  }
  return [];
}

function buildWerewolfReplayPlaybackEvents(game: ReplayGame): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  const replayPlayers = createWerewolfReplayPlayers(game.players || []);
  const visibleRounds: WerewolfRound[] = [];
  for (const sourceRound of game.rounds || []) {
    const nightRound = createWerewolfVisibleRound(sourceRound, 'night-start');
    const nightPhaseKey = getWerewolfReplayPhaseKey(
      sourceRound,
      visibleRounds.length + 1,
      'night',
    );
    const dayPhaseKey = getWerewolfReplayPhaseKey(
      sourceRound,
      visibleRounds.length + 1,
      'day',
    );
    visibleRounds.push(nightRound);
    events.push({
      type: 'phase-start',
      phase: 'night',
      phaseKey: nightPhaseKey,
      round: nightRound,
      message: '天黑请闭眼',
      game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds),
    });

    appendWerewolfNightPlaybackEvents(
      events,
      sourceRound,
      nightRound,
      nightPhaseKey,
      game,
      replayPlayers,
      visibleRounds,
    );
    Object.assign(nightRound, createWerewolfVisibleRound(sourceRound, 'day-start'));
    events.push({
      type: 'day-start',
      phaseKey: dayPhaseKey,
      round: nightRound,
      message: buildDayStartMessage(),
      game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds),
    });

    if (shouldReplayFirstDaySheriffBeforeNightResult(sourceRound)) {
      appendWerewolfSheriffPlaybackEvents(
        events,
        sourceRound,
        nightRound,
        dayPhaseKey,
        game,
        replayPlayers,
        visibleRounds,
      );
    }

    applyWerewolfNightDeaths(replayPlayers, sourceRound);
    Object.assign(nightRound, createWerewolfVisibleRound(sourceRound, 'night-result'));
    events.push({
      type: 'night-result',
      phaseKey: dayPhaseKey,
      round: nightRound,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      message: buildNightPublicMessage(nightRound as any, replayPlayers as unknown as Array<{ id: number }>),
      game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds),
    });
    appendWerewolfBadgePlaybackEvents(
      events,
      sourceRound,
      nightRound,
      dayPhaseKey,
      game,
      replayPlayers,
      visibleRounds,
      'night',
    );

    if (!shouldReplayFirstDaySheriffBeforeNightResult(sourceRound)) {
      appendWerewolfSheriffPlaybackEvents(
        events,
        sourceRound,
        nightRound,
        dayPhaseKey,
        game,
        replayPlayers,
        visibleRounds,
      );
    }

    for (const testimony of getWerewolfNightTestimonies(sourceRound)) {
      events.push({
        type: 'last-words',
        phaseKey: dayPhaseKey,
        round: nightRound,
        testimony,
        game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds),
      });
    }

    if (sourceRound.daySpeech) {
      nightRound.daySpeech = sourceRound.daySpeech;
      events.push({
        type: 'speech-order',
        phaseKey: dayPhaseKey,
        round: nightRound,
        game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds),
      });
    }

    const speeches = getRoundSpeeches(sourceRound);
    for (const speech of speeches) {
      nightRound.speeches = [...(nightRound.speeches || []), speech];
      events.push({
        type: 'speech',
        phaseKey: dayPhaseKey,
        round: nightRound,
        speech,
        game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds),
      });
    }

    applyWerewolfDayEliminations(replayPlayers, sourceRound);
    Object.assign(nightRound, createWerewolfVisibleRound(sourceRound, 'vote-result'));
    events.push({
      type: 'vote-result',
      phaseKey: dayPhaseKey,
      round: nightRound,
      game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds),
    });
    appendWerewolfBadgePlaybackEvents(
      events,
      sourceRound,
      nightRound,
      dayPhaseKey,
      game,
      replayPlayers,
      visibleRounds,
      'day',
    );

    for (const testimony of getWerewolfExileTestimonies(sourceRound)) {
      events.push({
        type: 'exile-words',
        phaseKey: dayPhaseKey,
        round: nightRound,
        testimony,
        game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds),
      });
    }
  }
  if (game.winner) {
    events.push({
      type: 'game',
      game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds, true),
    });
  }
  return events;
}

function getWerewolfReplayPhaseKey(
  round: WerewolfRound = {},
  roundIndex: number,
  phase: string,
): string {
  return `werewolf-${round.day || round.number || roundIndex}-${phase}`;
}

function appendWerewolfSheriffPlaybackEvents(
  events: Record<string, unknown>[],
  sourceRound: WerewolfRound,
  visibleRound: WerewolfRound,
  phaseKey: string,
  game: ReplayGame,
  replayPlayers: ReplayPlayer[],
  visibleRounds: WerewolfRound[],
): void {
  if (!shouldReplaySheriffElection(sourceRound)) return;
  const election = (sourceRound.sheriffElection || {}) as SheriffElection;
  visibleRound.sheriffId = null;
  visibleRound.sheriffBadge = { ...(visibleRound.sheriffBadge || {}), status: 'none' };
  visibleRound.sheriffElection = {
    ...election,
    speeches: [],
    withdrawnIds: [],
    candidates: election.signedUpIds || election.candidates || [],
    votes: {},
    tally: {},
    runoffSpeeches: [],
    runoffVotes: {},
    runoffTally: {},
    sheriffId: null,
    result: 'pending',
  };
  pushWerewolfPlaybackEvent(events, 'sheriff-start', phaseKey, visibleRound, game, replayPlayers, visibleRounds, {
    sheriffCandidateIds: visibleRound.sheriffElection!.candidates,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    message: buildSheriffStartMessage(visibleRound as any),
  });

  for (const speech of election.speeches || []) {
    visibleRound.sheriffElection!.speeches = [
      ...(visibleRound.sheriffElection!.speeches || []),
      speech,
    ];
    pushWerewolfPlaybackEvent(
      events,
      'sheriff-speech',
      phaseKey,
      visibleRound,
      game,
      replayPlayers,
      visibleRounds,
      { speech, sheriffCandidateIds: visibleRound.sheriffElection!.candidates },
    );
  }

  visibleRound.sheriffElection!.withdrawnIds = election.withdrawnIds || [];
  visibleRound.sheriffElection!.candidates = election.candidates || [];
  pushWerewolfPlaybackEvent(
    events,
    'sheriff-candidates',
    phaseKey,
    visibleRound,
    game,
    replayPlayers,
    visibleRounds,
    { sheriffCandidateIds: visibleRound.sheriffElection!.candidates },
  );

  visibleRound.sheriffElection!.voters = election.voters || [];
  visibleRound.sheriffElection!.votes = election.votes || {};
  visibleRound.sheriffElection!.tally = election.tally || {};
  pushWerewolfPlaybackEvent(
    events,
    'sheriff-vote',
    phaseKey,
    visibleRound,
    game,
    replayPlayers,
    visibleRounds,
    { sheriffCandidateIds: visibleRound.sheriffElection!.candidates },
  );

  visibleRound.sheriffElection!.runoffCandidateIds = election.runoffCandidateIds || [];
  visibleRound.sheriffElection!.runoffSpeechOrder = election.runoffSpeechOrder || [];
  for (const speech of election.runoffSpeeches || []) {
    visibleRound.sheriffElection!.runoffSpeeches = [
      ...(visibleRound.sheriffElection!.runoffSpeeches || []),
      speech,
    ];
    pushWerewolfPlaybackEvent(
      events,
      'sheriff-runoff-speech',
      phaseKey,
      visibleRound,
      game,
      replayPlayers,
      visibleRounds,
      {
        speech,
        sheriffCandidateIds: visibleRound.sheriffElection!.runoffCandidateIds,
      },
    );
  }
  if (
    Object.keys(election.runoffVotes || {}).length ||
    Object.keys(election.runoffTally || {}).length
  ) {
    visibleRound.sheriffElection!.runoffVotes = election.runoffVotes || {};
    visibleRound.sheriffElection!.runoffTally = election.runoffTally || {};
    pushWerewolfPlaybackEvent(
      events,
      'sheriff-runoff-vote',
      phaseKey,
      visibleRound,
      game,
      replayPlayers,
      visibleRounds,
      { sheriffCandidateIds: visibleRound.sheriffElection!.runoffCandidateIds },
    );
  }

  visibleRound.sheriffId = sourceRound.sheriffId || election.sheriffId || null;
  visibleRound.sheriffBadge = sourceRound.sheriffBadge || {
    status: visibleRound.sheriffId ? 'held' : 'none',
  };
  visibleRound.sheriffElection!.sheriffId = visibleRound.sheriffId;
  visibleRound.sheriffElection!.result = election.result;
  pushWerewolfPlaybackEvent(
    events,
    'sheriff-result',
    phaseKey,
    visibleRound,
    game,
    replayPlayers,
    visibleRounds,
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      message: buildSheriffResultMessage(visibleRound as any, game.werewolfMode || {}, replayPlayers as unknown as Array<{ id: number }>),
    },
  );
}

function appendWerewolfNightPlaybackEvents(
  events: Record<string, unknown>[],
  sourceRound: WerewolfRound,
  visibleRound: WerewolfRound,
  phaseKey: string,
  game: ReplayGame,
  replayPlayers: ReplayPlayer[],
  visibleRounds: WerewolfRound[],
): void {
  const night = (sourceRound.night || {}) as WerewolfNight;
  const configuredActions = getWerewolfReplayNightActions(game);
  pushWerewolfPlaybackEvent(
    events,
    'wolf-wake',
    phaseKey,
    visibleRound,
    game,
    replayPlayers,
    visibleRounds,
    { message: getWerewolfNightPrompt('wolf-wake') },
  );
  if (night.wolfLeaderId) {
    visibleRound.night!.wolfLeaderId = night.wolfLeaderId;
    pushWerewolfPlaybackEvent(
      events,
      'wolf-leader',
      phaseKey,
      visibleRound,
      game,
      replayPlayers,
      visibleRounds,
    );
  }
  visibleRound.night!.wolfSpeechOrder = night.wolfSpeechOrder || [];
  visibleRound.night!.wolfSpeeches = [];
  for (const speech of night.wolfSpeeches || []) {
    visibleRound.night!.wolfSpeeches = [...(visibleRound.night!.wolfSpeeches || []), speech];
    pushWerewolfPlaybackEvent(
      events,
      'wolf-speech',
      phaseKey,
      visibleRound,
      game,
      replayPlayers,
      visibleRounds,
      { speech },
    );
  }
  visibleRound.night!.wolfTarget = night.wolfTarget || null;
  visibleRound.night!.wolfChoices = night.wolfChoices || {};
  visibleRound.night!.wolfVoteTally = night.wolfVoteTally || {};
  visibleRound.night!.wolfTieBreak = night.wolfTieBreak || null;
  pushWerewolfPlaybackEvent(
    events,
    'wolf-vote',
    phaseKey,
    visibleRound,
    game,
    replayPlayers,
    visibleRounds,
  );
  if (configuredActions.has('inspectFaction')) {
    pushWerewolfPlaybackEvent(
      events,
      'seer-wake',
      phaseKey,
      visibleRound,
      game,
      replayPlayers,
      visibleRounds,
      { message: getWerewolfNightPrompt('seer-wake') },
    );
    if (night.seerCheck?.target) {
      visibleRound.night!.seerCheck = night.seerCheck;
      pushWerewolfPlaybackEvent(
        events,
        'seer-check',
        phaseKey,
        visibleRound,
        game,
        replayPlayers,
        visibleRounds,
        { seerCheck: night.seerCheck },
      );
    }
  }
  if (configuredActions.has('guard')) {
    pushWerewolfPlaybackEvent(
      events,
      'guard-wake',
      phaseKey,
      visibleRound,
      game,
      replayPlayers,
      visibleRounds,
      { message: getWerewolfNightPrompt('guard-wake') },
    );
    visibleRound.night!.guardTarget = night.guardTarget || null;
    pushWerewolfPlaybackEvent(
      events,
      'guard-action',
      phaseKey,
      visibleRound,
      game,
      replayPlayers,
      visibleRounds,
    );
  }
  if (configuredActions.has('save')) {
    pushWerewolfPlaybackEvent(
      events,
      'witch-antidote',
      phaseKey,
      visibleRound,
      game,
      replayPlayers,
      visibleRounds,
      { message: getWerewolfNightPrompt('witch-antidote') },
    );
    visibleRound.night!.witchSave = Boolean(night.witchSave);
    visibleRound.night!.witchSaveTarget =
      night.witchSaveTarget || (night.witchSave ? night.wolfTarget : null);
    pushWerewolfPlaybackEvent(
      events,
      'witch-action',
      phaseKey,
      visibleRound,
      game,
      replayPlayers,
      visibleRounds,
    );
  }
  if (configuredActions.has('poison')) {
    pushWerewolfPlaybackEvent(
      events,
      'witch-poison',
      phaseKey,
      visibleRound,
      game,
      replayPlayers,
      visibleRounds,
      { message: getWerewolfNightPrompt('witch-poison') },
    );
    visibleRound.night!.witchPoisonTarget = night.witchPoisonTarget || null;
    pushWerewolfPlaybackEvent(
      events,
      'witch-action',
      phaseKey,
      visibleRound,
      game,
      replayPlayers,
      visibleRounds,
    );
  }
}

function getWerewolfReplayNightActions(game: ReplayGame = {}): Set<string> {
  const actions = new Set<string>();
  const werewolfMode = game.werewolfMode as WerewolfModeConfig | undefined;
  for (const role of werewolfMode?.resolvedRoles || []) {
    for (const item of role?.rule?.actions || []) {
      if (item?.action) actions.add(item.action);
    }
  }
  if (actions.size) return actions;
  const replayRoles = new Set(
    (game.players || []).map((player) => player.role).filter(Boolean),
  );
  if (replayRoles.has('seer')) actions.add('inspectFaction');
  if (replayRoles.has('guard')) actions.add('guard');
  if (replayRoles.has('witch')) {
    actions.add('save');
    actions.add('poison');
  }
  return actions;
}

function appendWerewolfBadgePlaybackEvents(
  events: Record<string, unknown>[],
  sourceRound: WerewolfRound,
  visibleRound: WerewolfRound,
  phaseKey: string,
  game: ReplayGame,
  replayPlayers: ReplayPlayer[],
  visibleRounds: WerewolfRound[],
  phase: string,
): void {
  for (const sheriffTransfer of (sourceRound.sheriffTransfers || []).filter(
    (item) => item.phase === phase,
  )) {
    visibleRound.sheriffTransfers = [
      ...(visibleRound.sheriffTransfers || []),
      sheriffTransfer,
    ];
    visibleRound.sheriffId =
      sheriffTransfer.action === 'transfer' ? sheriffTransfer.to : null;
    visibleRound.sheriffBadge = {
      status: sheriffTransfer.action === 'transfer' ? 'held' : 'torn',
    };
    pushWerewolfPlaybackEvent(
      events,
      sheriffTransfer.action === 'transfer'
        ? 'sheriff-badge-transfer'
        : 'sheriff-badge-tear',
      phaseKey,
      visibleRound,
      game,
      replayPlayers,
      visibleRounds,
      { sheriffTransfer },
    );
  }
}

function pushWerewolfPlaybackEvent(
  events: Record<string, unknown>[],
  type: string,
  phaseKey: string,
  round: WerewolfRound,
  game: ReplayGame,
  replayPlayers: ReplayPlayer[],
  visibleRounds: WerewolfRound[],
  extra: Record<string, unknown> = {},
): void {
  events.push({
    type,
    phaseKey,
    round,
    ...extra,
    game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds),
  });
}

function createWerewolfReplaySnapshot(
  game: ReplayGame,
  players: ReplayPlayer[],
  rounds: WerewolfRound[],
  includeResult = false,
): Record<string, unknown> {
  return {
    ...game,
    players: players.map((player) => ({ ...player })),
    rounds: rounds.map((round) => ({
      ...round,
      night: { ...(round.night || {}) },
      speeches: [...(round.speeches || [])],
    })),
    winner: includeResult ? game.winner : null,
    winReason: includeResult ? game.winReason : '',
  };
}

function createWerewolfReplayPlayers(players: ReplayPlayer[]): ReplayPlayer[] {
  return players.map((player) => ({
    ...publicWerewolfReplayPlayer(player),
    alive: true,
    deathDay: null,
    deathReason: '',
    lastWords: [],
  }));
}

function publicWerewolfReplayPlayer({
  seerChecks: _seerChecks,
  ...player
}: ReplayPlayer = {}): Omit<ReplayPlayer, 'seerChecks'> {
  return player;
}

function createWerewolfVisibleRound(
  round: WerewolfRound = {},
  stage: string,
): WerewolfRound {
  const base: WerewolfRound = {
    ...round,
    phase: stage === 'night-start' ? 'night' : 'day',
    night: createWerewolfVisibleNight(round.night),
    sheriffTransfers: [],
    daySpeech: null,
    speeches: [],
    votes: {},
    voteTally: {},
    exile: null,
    idiotReveal: null,
    hunterShot: null,
  };
  if (
    (stage === 'night-start' || stage === 'day-start') &&
    shouldReplayFirstDaySheriffBeforeNightResult(round)
  ) {
    base.sheriffId = null;
    base.sheriffBadge = { status: 'none' };
    base.sheriffElection = null;
  }
  if (stage === 'night-start') {
    base.night = {
      ...createWerewolfVisibleNight(round.night),
      wolfTarget: null,
      wolfChoices: {},
      wolfVoteTally: {},
      wolfTieBreak: null,
      seerCheck: null,
      witchSave: false,
      witchSaveTarget: null,
      witchPoisonTarget: null,
      guardTarget: null,
      deaths: [],
    };
  }
  if (stage === 'day-start') {
    base.night = { ...base.night, deaths: [] };
    base.speeches = [];
  }
  if (stage === 'vote-result') {
    base.speeches = getRoundSpeeches(round);
    base.votes = round.votes || {};
    base.voteTally = round.voteTally || {};
    base.exile = round.exile || null;
    base.idiotReveal = round.idiotReveal || null;
    base.hunterShot = round.hunterShot || null;
  }
  return base;
}

function shouldReplayFirstDaySheriffBeforeNightResult(
  round: WerewolfRound = {},
): boolean {
  return Number(round.day) === 1 && Boolean(round.sheriffElection);
}

function createWerewolfVisibleNight(night: WerewolfNight = {}): WerewolfNight {
  return {
    wolfTarget: night.wolfTarget || null,
    wolfLeaderId: night.wolfLeaderId || null,
    wolfSpeechOrder: night.wolfSpeechOrder || [],
    wolfSpeeches: night.wolfSpeeches || [],
    wolfChoices: night.wolfChoices || {},
    wolfVoteTally: night.wolfVoteTally || {},
    wolfTieBreak: night.wolfTieBreak || null,
    seerCheck: night.seerCheck || null,
    witchSave: Boolean(night.witchSave),
    witchSaveTarget:
      night.witchSaveTarget || (night.witchSave ? night.wolfTarget : null),
    witchPoisonTarget: night.witchPoisonTarget || null,
    guardTarget: night.guardTarget || null,
    deaths: night.deaths || [],
  };
}

function applyWerewolfNightDeaths(
  players: ReplayPlayer[],
  round: WerewolfRound = {},
): void {
  for (const item of round.night?.deaths || []) {
    applyWerewolfReplayDeath(
      players,
      item.id ?? item.playerId,
      round.day,
      item.reason || item.deathReason || '夜晚死亡',
    );
  }
}

function applyWerewolfDayEliminations(
  players: ReplayPlayer[],
  round: WerewolfRound = {},
): void {
  if (round.exile?.id)
    applyWerewolfReplayDeath(
      players,
      round.exile.id,
      round.day,
      round.exile.deathReason || round.exile.reason || '放逐',
    );
  if (round.hunterShot?.target)
    applyWerewolfReplayDeath(players, round.hunterShot.target, round.day, '猎人带走');
}

function applyWerewolfReplayDeath(
  players: ReplayPlayer[],
  id: number | string | undefined,
  day: number | undefined,
  reason: string,
): void {
  const player = players.find((item) => Number(item.id) === Number(id));
  if (!player) return;
  player.alive = false;
  player.deathDay = day || player.deathDay || null;
  player.deathReason = reason || player.deathReason || '出局';
}

function buildDebateReplayEvents(game: ReplayGame): Record<string, unknown>[] {
  return (game.phases || []).flatMap((phase) => [
    { type: 'phase-start', phase },
    ...getRoundSpeeches(phase).map((speech) => ({
      type: 'speech',
      phase,
      speech: normalizeDebateSpeech(speech),
    })),
    { type: 'phase-end', phase },
  ]);
}

function shouldReplaySheriffElection(round: WerewolfRound = {}): boolean {
  return Boolean(round.sheriffElection);
}

function getDebatePhasesFromRounds(rounds: WerewolfRound[] = []): DebatePhase[] {
  return rounds.map((round, index) => ({
    id: round.phase || round.id || `phase-${index + 1}`,
    name: round.title || round.name || `第 ${index + 1} 阶段`,
    speeches: getRoundSpeeches(round),
  }));
}

function getRoundSpeeches(round: WerewolfRound | DebatePhase = {}): SpeechData[] {
  return ([] as SpeechData[])
    .concat(round.speeches || [])
    .concat((round as WerewolfRound).items || [])
    .concat((round as WerewolfRound).discussion || [])
    .filter(Boolean)
    .map((speech) => ({
      ...speech,
      playerId: speech.playerId ?? speech.player_id ?? speech.id,
      text: speech.text || speech.content || speech.message || '',
    }))
    .filter((speech) => speech.text);
}

function normalizeDebateSpeech(speech: SpeechData): SpeechData {
  return {
    ...speech,
    side: speech.side || (speech.playerId ? '' : 'host'),
    text: speech.text || '',
  };
}

function getWerewolfNightTestimonies(round: WerewolfRound = {}): TestimonyData[] {
  const nightDeathIds = new Set(
    (round.night?.deaths || [])
      .map((death) => Number(death.id ?? death.playerId))
      .filter(Boolean),
  );
  return getWerewolfTestimonies(round).filter((item) =>
    nightDeathIds.has(Number(item.playerId)),
  );
}

function getWerewolfExileTestimonies(round: WerewolfRound = {}): TestimonyData[] {
  const exileId = Number(round.exile?.id ?? round.exile?.playerId);
  return exileId
    ? getWerewolfTestimonies(round).filter(
        (item) => Number(item.playerId) === exileId,
      )
    : [];
}

function getWerewolfTestimonies(round: WerewolfRound = {}): TestimonyData[] {
  return ([] as TestimonyData[])
    .concat(round.lastWords || [])
    .concat(round.testimonies || [])
    .filter(Boolean)
    .map((item) => ({
      playerId: item.playerId ?? item.id,
      text: item.text || item.testimony || item.content || '',
    }))
    .filter((item) => item.text);
}

function normalizeGameType(gameType?: string): string {
  if (gameType === 'debate') return 'debate';
  if (gameType === 'werewolf') return 'werewolf';
  return 'werewolf';
}

export {
  replayGameSession,
  normalizeReplayGame,
  enrichReplayPlayers,
  getPlaybackGameSnapshot,
  buildReplayPlaybackEvents,
  buildWerewolfReplayPlaybackEvents,
  buildDebateReplayEvents,
  appendWerewolfSheriffPlaybackEvents,
  appendWerewolfNightPlaybackEvents,
  appendWerewolfBadgePlaybackEvents,
  pushWerewolfPlaybackEvent,
  createWerewolfReplaySnapshot,
  createWerewolfReplayPlayers,
  publicWerewolfReplayPlayer,
  createWerewolfVisibleRound,
  shouldReplayFirstDaySheriffBeforeNightResult,
  createWerewolfVisibleNight,
  applyWerewolfNightDeaths,
  applyWerewolfDayEliminations,
  applyWerewolfReplayDeath,
  shouldReplaySheriffElection,
  getWerewolfReplayPhaseKey,
  getWerewolfReplayNightActions,
  getDebatePhasesFromRounds,
  getRoundSpeeches,
  normalizeDebateSpeech,
  getWerewolfNightTestimonies,
  getWerewolfExileTestimonies,
  getWerewolfTestimonies,
};
