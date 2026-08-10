import crypto from 'node:crypto';
import type { DbExecutor } from '../db/types';
import * as authRepository from '../modules/auth/repository';
import { hashPasswordSync } from '../modules/auth/service';
import type { RunSessionDependencies } from '../modules/game-socket/service';
import { runSession } from '../modules/game-socket/service';
import type { GameSession } from '../modules/game-socket/session';
import * as playbackRepository from '../modules/game-socket/playbackRepository';
import { replayGameSession } from '../modules/game-socket/replay';
import {
  createTraceContext,
  flushObservability,
  flushTrace,
  markTraceComplete,
  recordEvent,
} from '../modules/observability';
import * as memoryRepository from '../modules/player-memory/repository';
import { createPlayer } from '../modules/players/service';

interface SmokePlayer { id: number; nickname: string }
interface PersistedUndercoverResult {
  gameId: string;
  modelFetchCalls: number;
  runnerCalls: number;
  sentTypes: string[];
}

function md5(value: string): string {
  return crypto.createHash('md5').update(value).digest('hex');
}

async function ensureSmokeAdmin(username: string, password: string): Promise<void> {
  if (await authRepository.findByUsername(username)) return;
  await authRepository.create(username, hashPasswordSync(md5(password)), 'Application smoke', true);
}

async function removeSmokeAdmin(database: DbExecutor, username: string): Promise<void> {
  await database.execute('DELETE FROM admin_users WHERE username = $1', [username]);
}

async function listSmokePlayers(database: DbExecutor): Promise<SmokePlayer[]> {
  let players = await database.queryMany<SmokePlayer>(
    'SELECT id, nickname FROM players WHERE enabled = 1 ORDER BY sort_order ASC, id ASC LIMIT 6',
  );
  for (let index = players.length; index < 6; index += 1) {
    await createPlayer({
      nickname: `Application Smoke Player ${index + 1}`,
      name: `Application Smoke Player ${index + 1}`,
      personality: 'Deterministic application smoke fixture',
      provider: 'application-smoke-fake',
      model: 'application-smoke-fake',
      modelId: null,
      fallbackModelId: null,
      voicePackageId: null,
      enabled: true,
      sortOrder: index + 1,
    });
  }
  if (players.length < 6) {
    players = await database.queryMany<SmokePlayer>(
      'SELECT id, nickname FROM players WHERE enabled = 1 ORDER BY sort_order ASC, id ASC LIMIT 6',
    );
  }
  if (players.length !== 6) throw new Error('Application smoke requires six enabled players');
  return players.map((player) => ({ id: Number(player.id), nickname: String(player.nickname) }));
}

function createImmediateSession(sent: Array<Record<string, unknown>>): GameSession {
  return {
    send(payload) { sent.push(payload); },
    async sendAndWait(payload) { sent.push(payload); },
    resolveAck() {},
    close() {},
    setPaused() {},
    skipCurrentPhase() {},
  };
}

async function runPersistedUndercover(runId: string, players: SmokePlayer[]): Promise<PersistedUndercoverResult> {
  const gameId = `application-smoke-${crypto.createHash('sha256').update(runId).digest('hex').slice(0, 16)}`;
  let runnerCalls = 0;
  let modelFetchCalls = 0;
  const sent: Array<Record<string, unknown>> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    modelFetchCalls += 1;
    throw new Error('External fetch is forbidden during application smoke');
  }) as typeof fetch;
  const dependencies: RunSessionDependencies = {
    resolveRunner: (() => ({
      gameType: 'undercover',
      session: {
        startMessage: 'Undercover application smoke started',
        doneMessage: 'Undercover application smoke completed',
        playback: { prefetchCount: 1, phaseLookahead: 1 },
        playerSelection: { min: 6, max: 6, errorMessage: 'Undercover requires six players' },
      },
      run: async (_config, context) => {
        runnerCalls += 1;
        await context?.onEvent?.({
          type: 'undercover-speech',
          message: 'Player one completed the smoke description',
          presentation: {
            displayText: 'Player one completed the smoke description',
            speakableText: '',
            suppressSpeech: true,
            requiresAck: false,
          },
        });
        return {
          id: gameId,
          gameType: 'undercover',
          mode: 'standard-6',
          winner: 'civilians',
          winReason: 'application smoke fixture',
          players: players.map((player, index) => ({
            id: index + 1,
            nickname: player.nickname,
            alive: index !== 5,
          })),
          rounds: [{ round: 1, descriptions: [{ playerId: 1, text: 'smoke description' }] }],
          event: { status: 'completed', debugMode: false },
          createdAt: new Date().toISOString(),
        };
      },
    })) as RunSessionDependencies['resolveRunner'],
    getRequestConfig: (async () => ({
      host: { id: 0, nickname: 'Smoke host', voicePackageId: null },
      players: players.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        name: player.nickname,
        provider: 'application-smoke-fake',
        model: 'application-smoke-fake',
        apiKey: '',
        voicePackageId: null,
      })),
      selectedPlayerIds: players.map((player) => player.id),
      gameType: 'undercover',
      topic: null,
      debateTeams: null,
      werewolfMode: null,
      clientViewMode: 'god',
      debugMode: false,
      missingProviders: [],
      realReady: true,
      mode: 'real',
    })) as RunSessionDependencies['getRequestConfig'],
  };
  try {
    await runSession(
      createImmediateSession(sent),
      'real',
      players.map((player) => player.id),
      'undercover',
      { clientViewMode: 'god' },
      dependencies,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  return { gameId, modelFetchCalls, runnerCalls, sentTypes: sent.map((payload) => String(payload.type || '')) };
}

async function replayStoredGame(gameId: string): Promise<string[]> {
  const sent: Array<Record<string, unknown>> = [];
  await replayGameSession(createImmediateSession(sent), 'undercover', gameId);
  return sent.map((payload) => String(payload.type || ''));
}

async function createAndUpdateMemory(players: SmokePlayer[], gameId: string): Promise<{
  gamesPlayed: number;
  ownerPlayerId: number;
  subjectPlayerId: number;
  summary: string;
}> {
  const input = {
    gameType: 'undercover',
    ownerPlayerId: players[0].id,
    subjectPlayerId: players[1].id,
    familiarityScore: 1,
  };
  await memoryRepository.upsertMemory({
    ...input,
    gamesPlayed: 1,
    traitsJson: JSON.stringify({ lastGameId: `${gameId}-previous` }),
    recentSummary: 'first smoke memory',
  });
  await memoryRepository.upsertMemory({
    ...input,
    gamesPlayed: 2,
    traitsJson: JSON.stringify({ lastGameId: gameId }),
    recentSummary: 'updated smoke memory',
  });
  const row = await memoryRepository.findMemory('undercover', players[0].id, players[1].id);
  if (!row) throw new Error('Application smoke memory was not persisted');
  return {
    gamesPlayed: Number(row.games_played),
    ownerPlayerId: input.ownerPlayerId,
    subjectPlayerId: input.subjectPlayerId,
    summary: String(row.recent_summary),
  };
}

async function createWorkflowAndObservabilityFixtures(
  database: DbExecutor,
  gameId: string,
  players: SmokePlayer[],
): Promise<string> {
  const timestamp = new Date().toISOString();
  await database.execute(`
    INSERT INTO matches (
      id, game_type, workflow_id, status, current_step_index, version,
      config_json, state_json, blockers_json, error_json, created_at, updated_at, completed_at
    ) VALUES ($1, 'undercover', 'undercover.workflow.standard.v1', 'completed', 0, 1,
      '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, 'null'::jsonb, $2, $2, $2)
  `, [gameId, timestamp]);
  await database.execute(`
    INSERT INTO workflow_events (match_id, seq, type, payload_json, visibility, channel, created_at)
    VALUES ($1, 1, 'application_smoke_fixture', '{}'::jsonb, 'system', 'system', $2)
  `, [gameId, timestamp]);
  const trace = createTraceContext(
    gameId,
    'undercover',
    'real',
    players.map((player) => ({ id: player.id, nickname: player.nickname })),
  );
  recordEvent(trace, { type: 'application-smoke-observability', phase: 'smoke' });
  markTraceComplete(trace);
  flushTrace(trace);
  await flushObservability();
  return trace.traceId;
}

async function listPlaybackSequences(gameId: string): Promise<number[]> {
  return (await playbackRepository.listPlaybackEvents(gameId)).map((event) => event.sequence);
}

export {
  createAndUpdateMemory,
  createWorkflowAndObservabilityFixtures,
  ensureSmokeAdmin,
  listPlaybackSequences,
  listSmokePlayers,
  removeSmokeAdmin,
  replayStoredGame,
  runPersistedUndercover,
};
export type { PersistedUndercoverResult, SmokePlayer };
