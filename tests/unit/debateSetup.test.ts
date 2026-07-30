import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import * as debateUtils from '../../packages/client/src/features/debate/debateUtils';

const { normalizeRandomizedDebateTeams } = debateUtils;

const Module = require('node:module');
Module._extensions['.css'] = () => undefined;
const { DraggableDebatePlayer } = require('../../packages/client/src/features/debate/components/DraggableDebatePlayer');
const { DebateTeamColumn } = require('../../packages/client/src/features/debate/components/DebateTeamColumn');

test('keeps any twelve players returned from a thirteen-player randomization request', () => {
  const result = normalizeRandomizedDebateTeams({
    proIds: [13, 2, 4, 6],
    conIds: [1, 3, 5, 7],
    judgeIds: [8, 9, 10, 11],
    proCaptainId: 13,
    conCaptainId: 1,
  });

  assert.deepEqual(result.proIds, [13, 2, 4, 6]);
  assert.deepEqual(result.conIds, [1, 3, 5, 7]);
  assert.equal(result.judgeIds.length, 4);
});

test('rejects an incomplete randomized response', () => {
  assert.throws(
    () => normalizeRandomizedDebateTeams({ proIds: [1, 2, 3], conIds: [4, 5, 6, 7] }),
    /随机分配结果不完整/,
  );
});

test('keeps the randomized twelve-player roster stable after a later player returns to the audience', () => {
  const resolveDebateRosterPlayerIds = (
    debateUtils as typeof debateUtils & {
      resolveDebateRosterPlayerIds?: (
        rosterPlayerIds: number[],
        teams: {
          proIds: Array<number | null>;
          conIds: Array<number | null>;
          judgeIds: Array<number | null>;
        },
        fallbackPlayerIds: number[],
      ) => number[];
    }
  ).resolveDebateRosterPlayerIds;

  assert.equal(typeof resolveDebateRosterPlayerIds, 'function');
  assert.deepEqual(
    resolveDebateRosterPlayerIds!(
      [5, 6, 10, 12, 1, 3, 4, 7, 8, 9, 11, 13],
      {
        proIds: [5, 6, 10, null],
        conIds: [1, 3, 4, 7],
        judgeIds: [8, 9, 11, 13],
      },
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    ),
    [5, 6, 10, 12, 1, 3, 4, 7, 8, 9, 11, 13],
  );
});

test('excludes the default host from the debate player pool', () => {
  const getDebateSelectablePlayers = (
    debateUtils as typeof debateUtils & {
      getDebateSelectablePlayers?: (
        players: Array<{ id: number; nickname: string }>,
        defaultHostId?: number,
      ) => Array<{ id: number; nickname: string }>;
    }
  ).getDebateSelectablePlayers;

  assert.equal(typeof getDebateSelectablePlayers, 'function');
  assert.deepEqual(
    getDebateSelectablePlayers!(
      [
        { id: 1, nickname: '辩手' },
        { id: 17, nickname: '主持人' },
      ],
      17,
    ).map((player) => player.id),
    [1],
  );
});

test('renders player and empty-slot assignment as keyboard-operable buttons', () => {
  const player = { id: 13, nickname: '主持人' };
  const card = renderToStaticMarkup(
    React.createElement(DraggableDebatePlayer, { player, selected: true, onClick: () => undefined }),
  );
  const column = renderToStaticMarkup(
    React.createElement(DebateTeamColumn, {
      title: '正方',
      tone: 'pro',
      ids: [],
      slots: 1,
      labelPrefix: '正方',
      getPlayer: () => undefined,
      onDrop: () => undefined,
      onSlotClick: () => undefined,
    }),
  );

  assert.match(card, /^<button/);
  assert.match(card, /aria-pressed="true"/);
  assert.match(column, /<button[^>]*class="team-slot-empty"/);
});
