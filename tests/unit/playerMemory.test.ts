import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactMessages,
  formatRelationshipMemoryList,
} from '../../packages/server/modules/player-memory/service';
import type { PlayerGameMemory } from '../../packages/server/modules/player-memory/types';
import { clearPlayerMemoriesSchema } from '../../packages/server/modules/player-memory/validator';

test('relationship memory is game-scoped, ranked and capped at 1200 characters', () => {
  const participants = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    sourcePlayerId: index + 1,
    nickname: `玩家${index + 1}`,
  }));
  const memories: PlayerGameMemory[] = participants.slice(1).map((player, index) => ({
    gameType: 'werewolf',
    ownerPlayerId: 1,
    subjectPlayerId: player.sourcePlayerId,
    gamesPlayed: 30 - index,
    familiarityScore: 80 - index,
    traits: {
      speechCount: 100,
      speechChars: 16000,
      wolfGames: 8,
      goodGames: 12,
    },
    recentSummary: '最近一局公开发言积极，投票阶段行动明确。',
    updatedAt: `2026-01-${String(index + 1).padStart(2, '0')}`,
  }));

  const prompt = formatRelationshipMemoryList([...memories].reverse(), participants, 'werewolf');

  assert.ok(prompt.length <= 1200);
  assert.equal(prompt.includes('来自历史公开表现，仅供参考'), true, prompt);
  assert.match(prompt, /玩家2/);
  assert.ok(prompt.indexOf('玩家2') < prompt.indexOf('玩家3'));
  const entries = prompt.split('\n').filter((line) => line.startsWith('- '));
  assert.ok(entries.length <= memories.length);
  assert.ok(entries.every((line) => line.length <= 100));
});

test('memory clear validator only accepts supported scopes', () => {
  assert.equal(clearPlayerMemoriesSchema.safeParse({ gameType: 'werewolf' }).success, true);
  assert.equal(clearPlayerMemoriesSchema.safeParse({ gameType: 'debate' }).success, true);
  assert.equal(clearPlayerMemoriesSchema.safeParse({ gameType: 'all' }).success, true);
  assert.equal(clearPlayerMemoriesSchema.safeParse({ gameType: 'consensus' }).success, false);
  assert.equal(clearPlayerMemoriesSchema.safeParse({}).success, false);
});

test('relationship memory skips low-confidence and non-participant profiles', () => {
  const prompt = formatRelationshipMemoryList([
    {
      gameType: 'werewolf',
      ownerPlayerId: 1,
      subjectPlayerId: 2,
      gamesPlayed: 1,
      familiarityScore: 1,
      traits: { speechCount: 5, speechChars: 500, goodGames: 1 },
      recentSummary: '只有一局记录。',
      updatedAt: '2026-01-01',
    },
    {
      gameType: 'werewolf',
      ownerPlayerId: 1,
      subjectPlayerId: 3,
      gamesPlayed: 5,
      familiarityScore: 5,
      traits: { speechCount: 20, speechChars: 2000, goodGames: 5 },
      recentSummary: '不在本局参赛名单。',
      updatedAt: '2026-01-02',
    },
  ], [
    { sourcePlayerId: 1, nickname: '玩家1' },
    { sourcePlayerId: 2, nickname: '玩家2' },
  ], 'werewolf');

  assert.equal(prompt, '');
});

test('session compaction keeps opening system and the latest 12 turn pairs', () => {
  const messages = [
    { role: 'system' as const, content: '完整开局信息' },
    ...Array.from({ length: 30 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `消息${index + 1}`,
    })),
  ];

  const compacted = compactMessages(messages);

  assert.equal(compacted[0].content, '完整开局信息');
  assert.match(compacted[1].content, /较早对话摘要/);
  assert.equal(compacted.length, 26);
  assert.equal(compacted.at(-1)?.content, '消息30');
});

test('session compaction carries the earlier summary into later compactions', () => {
  const first = compactMessages([
    { role: 'system', content: '完整开局信息' },
    ...Array.from({ length: 30 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `第一批${index + 1}`,
    })),
  ]);
  const second = compactMessages([
    ...first,
    ...Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `第二批${index + 1}`,
    })),
  ]);

  assert.match(second[1].content, /第一批1/);
  assert.equal(second.length, 26);
  assert.equal(second.at(-1)?.content, '第二批10');
});
