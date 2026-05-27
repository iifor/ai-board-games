import { countTargets } from './winCheck';
import { getTopCandidateIds, sortBySeat } from './utils';
import type { ActionResult, Agent, Round, Runtime } from './reducers';

interface SheriffElection {
  signedUpIds: number[];
  speechOrder: number[];
  speeches: Array<Record<string, unknown>>;
  withdrawnIds: number[];
  candidates: number[];
  voters: number[];
  votes: Record<string, number>;
  tally: Record<string, number>;
  runoffCandidateIds: number[];
  runoffSpeechOrder: number[];
  runoffSpeeches: Array<Record<string, unknown>>;
  runoffVotes: Record<string, number>;
  runoffTally: Record<string, number>;
  sheriffId: number | null;
  result: string;
}

function shouldRunSheriffElection(runtime: Runtime, round: Round): boolean {
  const sheriff = (runtime.modeConfig?.sheriff || {}) as Record<string, unknown>;
  return Number(round.day) === 1 && sheriff.enabled !== false && sheriff.firstDayElection !== false;
}

function ensureSheriffElection(round: Round): SheriffElection {
  if (!round.sheriffElection) {
    round.sheriffElection = {
      signedUpIds: [],
      speechOrder: [],
      speeches: [],
      withdrawnIds: [],
      candidates: [],
      voters: [],
      votes: {},
      tally: {},
      runoffCandidateIds: [],
      runoffSpeechOrder: [],
      runoffSpeeches: [],
      runoffVotes: {},
      runoffTally: {},
      sheriffId: null,
      result: 'pending'
    };
  }
  return round.sheriffElection as unknown as SheriffElection;
}

function getSheriffActorsForAction(runtime: Runtime, round: Round, actionType: string): Agent[] {
  if (!shouldRunSheriffElection(runtime, round)) return [];
  const alive = sortBySeat(runtime.agents.filter((agent) => agent.alive));
  const election = ensureSheriffElection(round);
  if (actionType === 'sheriff_signup') return alive;
  if (actionType === 'sheriff_speech') return byIds(alive, election.signedUpIds);
  if (actionType === 'sheriff_withdraw') return byIds(alive, election.signedUpIds);
  if (actionType === 'sheriff_vote') {
    if (!election.candidates.length) return [];
    return alive.filter((agent) => agent.canVote && !election.candidates.includes(Number(agent.id)));
  }
  if (actionType === 'sheriff_runoff_speech') return byIds(alive, election.runoffCandidateIds);
  if (actionType === 'sheriff_runoff_vote') {
    if (election.runoffCandidateIds.length <= 1) return [];
    return alive.filter((agent) => agent.canVote && !election.runoffCandidateIds.includes(Number(agent.id)));
  }
  return [];
}

function getSheriffTargetIds(round: Round, actionType: string): number[] {
  const election = ensureSheriffElection(round);
  if (actionType === 'sheriff_vote') return election.candidates;
  if (actionType === 'sheriff_runoff_vote') return election.runoffCandidateIds;
  return [];
}

function applySheriffActionResults(runtime: Runtime, round: Round, actionType: string, results: ActionResult[]): void {
  const election = ensureSheriffElection(round);
  if (actionType === 'sheriff_signup') applySignup(round, election, results);
  if (actionType === 'sheriff_speech') applySpeech(election, results, false);
  if (actionType === 'sheriff_withdraw') applyWithdraw(election, results);
  if (actionType === 'sheriff_vote') applyVote(election, results, false);
  if (actionType === 'sheriff_runoff_speech') applySpeech(election, results, true);
  if (actionType === 'sheriff_runoff_vote') applyVote(election, results, true);
  if (actionType === 'sheriff_resolve') resolveSheriffElection(runtime, round);
}

function resolveSheriffElection(runtime: Runtime, round: Round): void {
  const election = ensureSheriffElection(round);
  let sheriffId: number | null = null;
  let result = election.result || 'pending';
  if (!election.signedUpIds.length) {
    result = 'no-candidates';
  } else if (!election.candidates.length) {
    result = 'withdrawn';
  } else {
    const topIds = getTopCandidateIds(election.tally);
    if (topIds.length === 1 || election.candidates.length === 1) {
      sheriffId = topIds[0] || election.candidates[0] || null;
      result = sheriffId ? 'elected' : 'no-votes';
    } else if (!topIds.length) {
      result = 'no-votes';
    } else {
      election.runoffCandidateIds = election.runoffCandidateIds.length ? election.runoffCandidateIds : topIds;
      const runoffTopIds = getTopCandidateIds(election.runoffTally);
      sheriffId = runoffTopIds.length === 1 ? runoffTopIds[0] : null;
      result = sheriffId ? 'elected' : 'runoff-tie';
    }
  }
  round.sheriffId = sheriffId;
  round.sheriffBadge = { status: sheriffId ? 'held' : 'none' };
  election.sheriffId = sheriffId;
  election.result = result;
  runtime.agents.forEach((agent) => {
    if (Number(agent.id) === Number(sheriffId)) agent.sheriffId = sheriffId;
  });
}

function isSheriffResolveReady(round: Round): boolean {
  const election = ensureSheriffElection(round);
  if (!election.signedUpIds.length || !election.candidates.length) return true;
  const firstTopIds = getTopCandidateIds(election.tally);
  if (firstTopIds.length <= 1 || election.candidates.length === 1) return true;
  if (!election.runoffCandidateIds.length) election.runoffCandidateIds = firstTopIds;
  return Object.keys(election.runoffTally || {}).length > 0;
}

function shouldSkipSheriffAction(runtime: Runtime, round: Round, actionType: string): boolean {
  if (!shouldRunSheriffElection(runtime, round)) return true;
  const election = ensureSheriffElection(round);
  if (actionType === 'sheriff_speech') return !election.signedUpIds.length;
  if (actionType === 'sheriff_withdraw') return !election.signedUpIds.length;
  if (actionType === 'sheriff_vote') return !election.candidates.length;
  if (actionType === 'sheriff_runoff_speech') return getTopCandidateIds(election.tally).length <= 1;
  if (actionType === 'sheriff_runoff_vote') return election.runoffCandidateIds.length <= 1;
  return false;
}

function applySignup(round: Round, election: SheriffElection, results: ActionResult[]): void {
  election.signedUpIds = results.filter((result) => Boolean(result.payload.run)).map((result) => result.actorId);
  election.candidates = [...election.signedUpIds];
  election.result = election.signedUpIds.length ? 'pending' : 'no-candidates';
  round.sheriffBadge = round.sheriffBadge || { status: 'none' };
}

function applySpeech(election: SheriffElection, results: ActionResult[], runoff: boolean): void {
  const speeches = results.map((result) => ({
    playerId: result.actorId,
    text: result.payload.text || '',
    phase: 'sheriff',
    runoff,
    thinking: result.payload.thinking || ''
  }));
  if (runoff) {
    election.runoffSpeechOrder = results.map((result) => result.actorId);
    election.runoffSpeeches = speeches;
  } else {
    election.speechOrder = results.map((result) => result.actorId);
    election.speeches = speeches;
  }
}

function applyWithdraw(election: SheriffElection, results: ActionResult[]): void {
  election.withdrawnIds = results.filter((result) => Boolean(result.payload.withdraw)).map((result) => result.actorId);
  election.candidates = election.signedUpIds.filter((id) => !election.withdrawnIds.includes(Number(id)));
  election.result = election.candidates.length ? 'pending' : 'withdrawn';
}

function applyVote(election: SheriffElection, results: ActionResult[], runoff: boolean): void {
  const votes: Record<string, number> = {};
  for (const result of results) {
    if (result.payload.target != null) votes[result.actorId] = Number(result.payload.target);
  }
  if (runoff) {
    election.runoffVotes = votes;
    election.runoffTally = countTargets(votes);
    return;
  }
  election.voters = results.map((result) => result.actorId);
  election.votes = votes;
  election.tally = countTargets(votes);
  const topIds = getTopCandidateIds(election.tally);
  election.runoffCandidateIds = topIds.length > 1 ? topIds : [];
}

function byIds(agents: Agent[], ids: number[]): Agent[] {
  const idSet = new Set(ids.map(Number));
  return agents.filter((agent) => idSet.has(Number(agent.id)));
}

export {
  shouldRunSheriffElection,
  ensureSheriffElection,
  getSheriffActorsForAction,
  getSheriffTargetIds,
  applySheriffActionResults,
  resolveSheriffElection,
  isSheriffResolveReady,
  shouldSkipSheriffAction
};

export type { SheriffElection };
