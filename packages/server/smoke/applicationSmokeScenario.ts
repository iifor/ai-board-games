import type { DbExecutor } from '../db/types';
import {
  createAndUpdateMemory,
  createWorkflowAndObservabilityFixtures,
  ensureSmokeAdmin,
  listPlaybackSequences,
  listSmokePlayers,
  removeSmokeAdmin,
  replayStoredGame,
  runPersistedUndercover,
} from './applicationSmokeFixtures';
import {
  loginAndChangeInitialPassword,
  requestJson,
  requireStatus,
  verifyConfigurationRoutesAndSkinCrud,
} from './applicationSmokeHttp';
import { startApplicationSmokeRuntime } from './applicationSmokeLifecycle';
import type {
  ApplicationSmokeAdapterRequest,
  ApplicationSmokeAdapterResponse,
  ApplicationSmokeCheck,
} from './applicationSmokeTypes';

async function countRows(database: DbExecutor, table: string, column: string, value: string): Promise<number> {
  const allowed = new Set([
    'games.id', 'game_players.game_id', 'game_playback_events.game_id',
    'matches.id', 'workflow_events.match_id', 'game_traces.id',
  ]);
  if (!allowed.has(`${table}.${column}`)) throw new Error('Unsafe smoke count query');
  const row = await database.queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = $1`,
    [value],
  );
  return Number(row?.count || 0);
}

async function countMemory(
  database: DbExecutor,
  ownerPlayerId: number,
  subjectPlayerId: number,
): Promise<number> {
  const row = await database.queryOne<{ count: number }>(`
    SELECT COUNT(*) AS count
    FROM player_game_memories
    WHERE game_type = 'undercover' AND owner_player_id = $1 AND subject_player_id = $2
  `, [ownerPlayerId, subjectPlayerId]);
  return Number(row?.count || 0);
}

function passed(checks: ApplicationSmokeCheck[], id: string, message: string): void {
  checks.push({ id, status: 'passed', message });
}

async function runApplicationSmokeScenario(
  request: ApplicationSmokeAdapterRequest,
  observabilityErrors: string[],
): Promise<ApplicationSmokeAdapterResponse> {
  const checks: ApplicationSmokeCheck[] = [];
  const errors: ApplicationSmokeAdapterResponse['errors'] = [];
  const runtime = await startApplicationSmokeRuntime(request);
  let token = '';
  try {
    const health = await requestJson(runtime.baseUrl, '/api/toc/health');
    requireStatus(health, 200, 'Connected health');
    if ((health.body.data as { ok?: boolean } | undefined)?.ok !== true) throw new Error('Connected health was false');
    passed(checks, 'health.connected', 'Health route verified a live PostgreSQL connection');

    await ensureSmokeAdmin(runtime.adminUsername, runtime.adminPassword);
    token = await loginAndChangeInitialPassword(runtime.baseUrl, runtime.adminUsername, runtime.adminPassword);
    passed(checks, 'auth.initial-password-change', 'Initial administrator login and forced password change passed');

    await verifyConfigurationRoutesAndSkinCrud(runtime.baseUrl, token, request.runId);
    passed(checks, 'config.read-and-crud', 'Configuration reads and skin CRUD passed through Express routes');

    const players = await listSmokePlayers(runtime.database);
    const persisted = await runPersistedUndercover(request.runId, players);
    const gameId = persisted.gameId;
    if (persisted.runnerCalls !== 1 || persisted.modelFetchCalls !== 0) {
      throw new Error('Undercover fake dependency boundary was not respected');
    }
    passed(checks, 'undercover.persisted-without-external-calls', 'A non-debug Undercover game persisted with fake server dependencies and no network calls');

    const detail = await requestJson(runtime.baseUrl, `/api/toc/games/${encodeURIComponent(gameId)}`);
    requireStatus(detail, 200, 'Game detail');
    const sequences = await listPlaybackSequences(gameId);
    if (!sequences.length || sequences.some((sequence, index) => sequence !== index + 1)) {
      throw new Error('Stored playback sequence is not contiguous');
    }
    const replayTypes = await replayStoredGame(gameId);
    const expectedReplayTypes = ['host', 'undercover-speech', 'done'];
    if (replayTypes.join(',') !== expectedReplayTypes.join(',')
      || persisted.sentTypes.join(',') !== expectedReplayTypes.join(',')) {
      throw new Error('Stored replay order did not match live playback');
    }
    passed(checks, 'history.detail-and-replay-order', 'Detail route and ordered stored replay passed');

    const memory = await createAndUpdateMemory(players, gameId);
    if (memory.gamesPlayed !== 2 || memory.summary !== 'updated smoke memory') throw new Error('Memory update was not persisted');
    passed(checks, 'memory.created-and-updated', 'Cross-game player memory was created and updated');

    const traceId = await createWorkflowAndObservabilityFixtures(runtime.database, gameId, players);
    if (await countRows(runtime.database, 'matches', 'id', gameId) !== 1
      || await countRows(runtime.database, 'workflow_events', 'match_id', gameId) !== 1
      || await countRows(runtime.database, 'game_traces', 'id', traceId) !== 1) {
      throw new Error('Workflow or observability fixture was not persisted');
    }
    const deletion = await requestJson(runtime.baseUrl, `/api/admin/workflow/matches/${encodeURIComponent(gameId)}`, {
      method: 'DELETE', token,
    });
    requireStatus(deletion, 200, 'Workflow match deletion');
    for (const [table, column] of [
      ['games', 'id'], ['game_players', 'game_id'], ['game_playback_events', 'game_id'],
      ['matches', 'id'], ['workflow_events', 'match_id'], ['game_traces', 'id'],
    ] as const) {
      const identifier = table === 'game_traces' ? traceId : gameId;
      if (await countRows(runtime.database, table, column, identifier)) throw new Error(`${table} fixture survived formal deletion`);
    }
    if (await countMemory(runtime.database, memory.ownerPlayerId, memory.subjectPlayerId) !== 1) {
      throw new Error('Cross-game memory was removed by match deletion');
    }
    passed(checks, 'workflow.observability-delete', 'Formal delete removed game, workflow, playback and observability rows while preserving memory');

    await runtime.disconnectHealthProbe();
    const unhealthy = await requestJson(runtime.baseUrl, '/api/toc/health');
    requireStatus(unhealthy, 503, 'Disconnected health');
    if (unhealthy.body.ok !== false) throw new Error('Disconnected health did not report false');
    passed(checks, 'health.disconnected', 'Health route reported unhealthy after a real PostgreSQL disconnect');
  } catch {
    errors.push({ code: 'APPLICATION_SMOKE_FAILED', message: 'Application smoke scenario failed' });
  } finally {
    try { await removeSmokeAdmin(runtime.database, runtime.adminUsername); }
    catch { errors.push({ code: 'APPLICATION_SMOKE_ADMIN_CLEANUP_FAILED', message: 'Application smoke administrator cleanup failed' }); }
    try { await runtime.close(); }
    catch { errors.push({ code: 'APPLICATION_SMOKE_TEARDOWN_FAILED', message: 'Application smoke teardown failed' }); }
  }
  if (observabilityErrors.length) {
    errors.push({ code: 'APPLICATION_SMOKE_OBSERVABILITY_NOT_DRAINED', message: 'Observability writes continued after teardown' });
    checks.push({ id: 'teardown.observability-drained', status: 'failed', message: 'Observability teardown emitted PostgreSQL write errors' });
  } else {
    passed(checks, 'teardown.observability-drained', 'HTTP stopped and observability writes drained before database teardown');
  }
  return { ok: errors.length === 0, schema: request.targetSchema, checks, errors };
}

export { runApplicationSmokeScenario };
