import assert from 'node:assert/strict';
import test from 'node:test';
import { setDbExecutorForTests } from '../../packages/server/db';
import { migratePostgres } from '../../packages/server/db/postgres/migrate';
import * as gameRepo from '../../packages/server/modules/games/repository';
import * as playbackRepo from '../../packages/server/modules/game-socket/playbackRepository';
import * as memoryRepo from '../../packages/server/modules/player-memory/repository';
import * as playerRepo from '../../packages/server/modules/players/repository';
import * as observabilityRepo from '../../packages/server/modules/observability/db';
import { withTestSchema } from './helpers';

test('game history keeps playback order and preserves cross-game memories on delete', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    setDbExecutorForTests(database);
    try {
      for (const id of [1, 2]) {
        await playerRepo.insertPlayer({
          id, nickname: `Player ${id}`, name: '', avatar: '', sex: 'unknown', personality: '',
          provider: '', model: '', model_id: null, fallback_model_id: null,
          voice_package_id: null, temperature: 0.8, enabled: 1, sort_order: id,
        });
      }
      await database.withTransaction(async (transaction) => {
        await gameRepo.insertOrReplaceGame({
          id: 'game-1', game_type: 'werewolf', mode: 'real', skin_id: null, skin_name: '',
          winner: 'good', win_reason: 'test', topic_json: '{}', players_json: '[]', rounds_json: '[]',
          event_json: '{}', audio_resources_json: '[]', definition_version: '1.0.0',
          snapshot_schema_version: 1, variant_key: null, variant_revision: null,
          variant_snapshot_json: '{}', created_at: '2026-08-08T00:00:00.000Z',
        }, transaction);
        await gameRepo.insertGamePlayer('game-1', 1, '{"id":1}', transaction);
        await playbackRepo.replacePlaybackEvents('game-1', [
          { protocolVersion: 1, sequence: 2, eventType: 'second', viewMode: 'god', payload: {}, media: [] },
          { protocolVersion: 1, sequence: 1, eventType: 'first', viewMode: 'god', payload: {}, media: [] },
        ], transaction);
      });
      await memoryRepo.upsertMemory({
        gameType: 'werewolf', ownerPlayerId: 1, subjectPlayerId: 2, gamesPlayed: 1,
        familiarityScore: 1, traitsJson: '{"lastGameId":"game-1"}', recentSummary: 'memory',
      });

      assert.deepEqual((await playbackRepo.listPlaybackEvents('game-1')).map((event) => event.sequence), [1, 2]);
      assert.equal((await gameRepo.findAllGames({ playerId: 1 })).length, 1);

      await gameRepo.deleteGameById('game-1');
      assert.equal((await playbackRepo.listPlaybackEvents('game-1')).length, 0);
      assert.equal((await memoryRepo.findMemories('werewolf', 1, [2])).length, 1);
    } finally {
      setDbExecutorForTests(null);
    }
  });
});

test('observability records are associated and deleted by persisted game id', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    setDbExecutorForTests(database);
    try {
      await observabilityRepo.insertTrace({
        id: 'trace-1', game_type: 'werewolf', game_mode: 'real', status: 'completed',
        llm_call_count: 0, agent_decision_count: 0, event_count: 0, error_message: null,
        created_at: '2026-08-08T00:00:00.000Z', completed_at: '2026-08-08T00:01:00.000Z',
        duration_ms: 60000, participants_json: '[]',
      });
      await observabilityRepo.insertSpan({
        id: 'span-1', trace_id: 'trace-1', parent_span_id: null, span_type: 'game-root',
        span_name: 'game-root', start_time: '2026-08-08T00:00:00.000Z',
        end_time: '2026-08-08T00:01:00.000Z', status: 'ok',
        attributes_json: '{"game.id":"game-1"}', error_json: null,
        created_at: '2026-08-08T00:00:00.000Z',
      });

      assert.equal(await observabilityRepo.deleteTracesByGameId('game-1'), 1);
      assert.equal(await observabilityRepo.findTraceById('trace-1'), undefined);
    } finally {
      setDbExecutorForTests(null);
    }
  });
});
