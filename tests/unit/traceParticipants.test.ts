import test from 'node:test';
import assert from 'node:assert/strict';
import { readParticipantsFromState } from '../../packages/server/modules/observability/db';

test('trace participants preserve seat id, source player id and nickname', () => {
  const participants = readParticipantsFromState(JSON.stringify({
    players: [
      { id: 11, seatNumber: 11, sourcePlayerId: 11, nickname: 'ChatGPT' },
      { id: 12, seatNumber: 12, sourcePlayerId: 13, nickname: 'Claude Code' },
    ],
  }));

  assert.deepEqual(participants, [
    { seatId: 11, sourcePlayerId: 11, nickname: 'ChatGPT' },
    { seatId: 12, sourcePlayerId: 13, nickname: 'Claude Code' },
  ]);
});
