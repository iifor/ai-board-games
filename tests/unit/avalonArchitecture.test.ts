import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getGameEngine, resetGameEngine } from '../../packages/server/modules/engine-registry';
import { resolveGameRunner } from '../../packages/server/modules/game-socket/gameRunner';
import { createInitialAvalonState, getPrivateKnowledge } from '../../packages/server/modules/avalon/rules';
import { toAvalonPublicState } from '../../packages/server/modules/avalon/presentation';
import { createAvalonGameDefinition } from '../../packages/server/modules/avalon/definition';
import { preparePlayersByRule } from '../../packages/server/modules/game-engine/session/sessionPreparation';
import { GameEngine } from '../../packages/server/modules/game-engine';
import { MemoryMatchStateStore } from './gameEngineTestUtils';
import type { GameDefinition } from '../../packages/shared/types/gameEngine';
import {
  AVALON_VISUAL_QA_GAME,
  AVALON_VISUAL_QA_SPEECH,
  isAvalonVisualQaEnabled,
} from '../../packages/client/src/features/avalon/visualQa';

const players = Array.from({ length: 5 }, (_, index) => ({
  id: index + 1,
  nickname: `玩家${index + 1}`,
}));

test('all four games resolve through registered definition runtimes', () => {
  resetGameEngine();
  const definitions = getGameEngine().listDefinitions();
  assert.deepEqual(
    definitions.map((definition) => definition.gameType).sort(),
    ['avalon', 'debate', 'undercover', 'werewolf'],
  );
  for (const gameType of ['avalon', 'debate', 'undercover', 'werewolf']) {
    const runner = resolveGameRunner(gameType);
    assert.equal(runner.gameType, gameType);
    assert.equal(typeof runner.run, 'function');
    assert.ok(runner.session.playerSelection);
  }

  const runnerSource = readFileSync(
    resolve('packages/server/modules/game-socket/gameRunner.ts'),
    'utf8',
  );
  assert.doesNotMatch(runnerSource, /gameType\s*===\s*['"](?:avalon|debate|undercover|werewolf)['"]/);
});

test('GameEngine executes definition runtimes and scopes same-name effect resolvers per game', async () => {
  const engine = new GameEngine({ store: new MemoryMatchStateStore() });
  const definition = (gameType: string): GameDefinition => ({
    gameType,
    version: '1.0.0',
    workflowId: `${gameType}.workflow`,
    runtime: {
      execute: async ({ config }) => ({ gameType, value: config?.value }),
    },
    effectResolvers: [{ effectType: 'shared-effect-name', resolve: () => [] }],
  });
  engine.registerDefinition(definition('extension-a'));
  engine.registerDefinition(definition('extension-b'));

  assert.deepEqual(
    await engine.runGame('extension-b', { config: { value: 42 } }),
    { gameType: 'extension-b', value: 42 },
  );
});

test('Avalon definition owns its exact-five session rule and action contracts', async () => {
  const definition = createAvalonGameDefinition();
  assert.equal(definition.metadata?.session?.playerSelection?.min, 5);
  assert.equal(definition.metadata?.session?.playerSelection?.max, 5);
  assert.deepEqual(Object.keys(definition.actionSchemas || {}).sort(), [
    'avalon_assassinate',
    'avalon_propose_team',
    'avalon_quest_vote',
    'avalon_team_vote',
  ]);

  const input = {
    availablePlayers: players,
    requestedPlayerIds: [5, 3, 1, 4, 2],
    savedPlayerIds: [],
    request: {},
  };
  const rule = definition.metadata!.session!.playerSelection!;
  const prepared = preparePlayersByRule(input, rule);
  assert.deepEqual(prepared.players.map((player) => player.id), [5, 3, 1, 4, 2]);
  assert.throws(
    () => preparePlayersByRule({ ...input, requestedPlayerIds: [1, 2, 3, 4] }, rule),
    /恰好 5 位/,
  );
});

test('Avalon standard-5 rules are deterministic and public projection is secret-safe', () => {
  const first = createInitialAvalonState(players, 20260823);
  const second = createInitialAvalonState(players, 20260823);
  assert.deepEqual(first.players, second.players);
  assert.deepEqual(first.missions.map((mission) => mission.teamSize), [2, 3, 2, 3, 3]);
  assert.deepEqual(
    first.players.map((player) => player.role).sort(),
    ['assassin', 'loyal_servant', 'merlin', 'morgana', 'percival'],
  );
  assert.equal(first.players.filter((player) => player.faction === 'good').length, 3);
  assert.equal(first.players.filter((player) => player.faction === 'evil').length, 2);
  for (const player of first.players) assert.ok(getPrivateKnowledge(first, player.id).length > 0);

  const running = toAvalonPublicState(first);
  const runningJson = JSON.stringify(running);
  assert.doesNotMatch(runningJson, /"role"|"faction"|teamVotes|questVotes|"seed"/);
  assert.equal(running.reveal, undefined);

  const completed = toAvalonPublicState({ ...first, status: 'completed', winner: 'good' });
  assert.equal(completed.reveal?.length, 5);
});

test('client catalog, router and renderer registry expose Avalon without App branches', () => {
  const catalog = readFileSync(resolve('packages/client/src/games/catalog.ts'), 'utf8');
  const renderers = readFileSync(resolve('packages/client/src/games/renderers.tsx'), 'utf8');
  const router = readFileSync(resolve('packages/client/src/router/clientRouter.ts'), 'utf8');
  const app = readFileSync(resolve('packages/client/src/App.tsx'), 'utf8');

  assert.match(catalog, /key: 'avalon'/);
  assert.match(catalog, /min: 5, max: 5, recommended: 5/);
  assert.match(renderers, /avalon:\s*\(/);
  assert.match(router, /isClientGameRoute/);
  assert.doesNotMatch(app, /gameKey\s*===/);
});

test('Avalon v2 visual QA state is development-only and mirrors a legal public game state', () => {
  assert.equal(isAvalonVisualQaEnabled('?visualQaAvalon=1', true), true);
  assert.equal(isAvalonVisualQaEnabled('?visualQaAvalon=1', false), false);
  assert.equal(isAvalonVisualQaEnabled('?visualQaAvalon=0', true), false);
  assert.equal(AVALON_VISUAL_QA_GAME.status, 'team-vote');
  assert.deepEqual(AVALON_VISUAL_QA_GAME.missions.map((mission) => mission.teamSize), [2, 3, 2, 3, 3]);
  assert.deepEqual(AVALON_VISUAL_QA_GAME.currentTeamIds, [3, 4, 5]);
  assert.equal(AVALON_VISUAL_QA_SPEECH.speakerRole, 'host');
  assert.equal(AVALON_VISUAL_QA_GAME.reveal, undefined);
});

test('Avalon v2 reuses the shared stage and host cutout without exposing individual votes', () => {
  const game = readFileSync(resolve('packages/client/src/features/avalon/AvalonGame/index.tsx'), 'utf8');
  const arena = readFileSync(resolve('packages/client/src/features/avalon/components/AvalonArena.tsx'), 'utf8');
  const styles = readFileSync(resolve('packages/client/src/features/avalon/AvalonGame/index.css'), 'utf8');

  assert.match(game, /variant=\{variant\}/);
  assert.match(game, /host=\{visibleHost\}/);
  assert.match(game, /activeSpeech=\{visibleSpeech\}/);
  assert.match(arena, /<PlayerPosterSpotlight/);
  assert.match(arena, /variant="cutout"/);
  assert.match(arena, /className="avalon-mission-track"/);
  assert.match(arena, /publicVotes/);
  assert.doesNotMatch(arena, /player\.vote|voteByPlayer|逐人/);
  assert.match(styles, /stage-background\.png/);
  assert.match(styles, /\.avalon-player-seat\.is-selected/);
  assert.match(styles, /\.avalon-stage-narration/);
});
