import assert from 'node:assert/strict';
import test from 'node:test';
import { setDbExecutorForTests } from '../../packages/server/db';
import { migratePostgres } from '../../packages/server/db/postgres/migrate';
import { toPlaybackEvent } from '../../packages/server/modules/game-socket/playback';
import * as playbackRepo from '../../packages/server/modules/game-socket/playbackRepository';
import { replayGameSession } from '../../packages/server/modules/game-socket/replay';
import * as gamesService from '../../packages/server/modules/games/service';
import { createUndercoverWorkflowMatch } from '../../packages/server/modules/undercover/workflow';
import { withTestSchema } from './helpers';

test('debug Undercover persists detail and replays stored host and display events in sequence order', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    setDbExecutorForTests(database);
    try {
      const players = Array.from({ length: 6 }, (_, index) => ({
        id: index + 101,
        nickname: `${index + 1}号`,
        avatar: '',
      }));
      const createStartedAt = Date.now();
      const match = await createUndercoverWorkflowMatch({
        debugMode: true,
        players,
        debug: {
          seed: 42,
          civilianWord: '咖啡',
          undercoverWord: '奶茶',
          undercoverPlayerId: 102,
        },
      });
      assert.ok(Date.now() - createStartedAt < 5_000,
        'debug breakpoint creation must reuse the tick transaction without lock waiting');
      assert.equal(match.gameType, 'undercover');
      assert.equal(match.config.debugMode, true);

      const storedEvents = [
        toPlaybackEvent({
          type: 'undercover-speech',
          message: '1号完成描述',
          presentation: {
            displayText: '1号完成描述',
            suppressSpeech: true,
            requiresAck: false,
          },
        }, 'god', 2),
        toPlaybackEvent({ type: 'host', message: '谁是卧底开始' }, 'god', 1),
      ];
      await gamesService.saveGameRecord({
        id: match.id,
        gameType: 'undercover',
        mode: 'debug',
        winner: 'civilians',
        winReason: 'debug fixture complete',
        players: [],
        event: { debugMode: true, status: 'completed' },
        playbackEvents: storedEvents,
        createdAt: '2026-08-10T00:00:00.000Z',
      });

      const detail = await gamesService.getGame(match.id);
      assert.equal(detail?.id, match.id);
      assert.equal(detail?.gameType, 'undercover');
      assert.equal(detail?.mode, 'debug');
      assert.equal(detail?.winner, 'civilians');
      assert.deepEqual(detail?.event, { debugMode: true, status: 'completed' });
      assert.match(detail?.createdAt || '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      const history = await playbackRepo.listPlaybackEvents(match.id);
      assert.deepEqual(history.map((event) => event.sequence), [1, 2]);
      assert.deepEqual(history.map((event) => event.eventType), ['host', 'undercover-speech']);
      assert.equal(history[1].payload.presentation
        && (history[1].payload.presentation as Record<string, unknown>).displayText,
      '1号完成描述');

      const sent: Array<Record<string, unknown>> = [];
      let closed = false;
      const session = {
        send(payload: Record<string, unknown>) { sent.push(payload); },
        async sendAndWait(payload: Record<string, unknown>) { sent.push(payload); },
        resolveAck() {},
        close() { closed = true; },
        setPaused() {},
        skipCurrentPhase() {},
      };
      await replayGameSession(session as never, 'undercover', match.id);
      assert.deepEqual(sent.map((event) => event.type), ['host', 'undercover-speech']);
      assert.deepEqual(sent.map((event) => event.message), ['谁是卧底开始', '1号完成描述']);
      assert.equal(closed, true);
    } finally {
      setDbExecutorForTests(null);
    }
  });
});
