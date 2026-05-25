import test from 'node:test';
import assert from 'node:assert/strict';
import * as repo from '../../packages/server/modules/workflow-engine/repository';
import { createActionWindowHandler } from '../../packages/server/modules/werewolf/handlers/actionWindowHandler';
import { createNightResolveHandler, createExileResolveHandler } from '../../packages/server/modules/werewolf/handlers/resolveHandlers';
import { createRound } from '../../packages/server/modules/werewolf/agents';

type RepoPatch = Pick<typeof repo, 'upsertActionWindowEpoch' | 'listEvents' | 'createAiTask' | 'listAiTasks' | 'listPendingActions'>;

test('fake werewolf action window opens, completes, and night resolve emits effects', () => {
  const original = snapshotRepo(repo);
  const tasks: Array<Record<string, unknown>> = [];
  const epochs: Array<Record<string, unknown>> = [];
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => { epochs.push(epoch); return epoch; },
      listEvents: () => [],
      createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
      listPendingActions: () => [],
      listAiTasks: () => tasks as never
    });

    const state = createState();
    const match = { id: 'm-fake', config: { players: state.players }, createdAt: 'now' };
    const wolfStep = { id: 'wolf_kill_1', type: 'werewolf.action_window', config: { day: 1, phase: 'night', actionType: 'wolf_kill' } };
    const actionHandler = createActionWindowHandler();

    const opened = actionHandler.execute({ match, step: wolfStep, state } as never);
    assert.equal(opened.status, 'WAITING');
    assert.equal(opened.tasks?.length, 1);
    assert.equal(opened.events?.[0].type, 'werewolf_action_requested');
    tasks.push(...(opened.tasks || []));

    tasks[0] = {
      ...tasks[0],
      status: 'succeeded',
      playerId: 1,
      result: { payload: { target: 2, speech: 'target 2' } }
    };
    const completed = actionHandler.execute({ match, step: wolfStep, state: opened.state } as never);
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.state?.rounds[0].night.wolfTarget, 2);

    const nightResolved = createNightResolveHandler().execute({
      match,
      step: { id: 'night_resolve_1', type: 'werewolf.night_resolve', config: { day: 1, phase: 'night' } },
      state: completed.state
    } as never);
    assert.equal(nightResolved.status, 'COMPLETED');
    assert.equal(nightResolved.events?.[0].type, 'werewolf_effect_resolved');
    assert.equal(nightResolved.state?.players.find((player: Record<string, unknown>) => Number(player.id) === 2).alive, false);

    const dayVotedState = {
      ...nightResolved.state,
      rounds: [{ ...nightResolved.state?.rounds[0], votes: { 1: 3, 3: 3 } }]
    };
    const exileResolved = createExileResolveHandler().execute({
      match,
      step: { id: 'exile_resolve_1', type: 'werewolf.exile_resolve', config: { day: 1, phase: 'day' } },
      state: dayVotedState
    } as never);
    assert.equal(exileResolved.status, 'COMPLETED');
    assert.equal(exileResolved.state?.rounds[0].exile.id, 3);
  } finally {
    patchRepo(repo, original);
  }
});

function createState(): Record<string, unknown> {
  const round = createRound(1);
  return {
    modeConfig: { sheriff: {}, witch: {}, roleMap: {} },
    werewolfMode: { id: 'fake', name: 'Fake' },
    host: { id: 0, name: 'host' },
    players: [
      player(1, 'werewolf', 'wolves', ['kill']),
      player(2, 'villager', 'good', []),
      player(3, 'villager', 'good', [])
    ],
    rounds: [round],
    completedSteps: {},
    winner: null,
    winReason: ''
  };
}

function player(id: number, role: string, faction: string, actions: string[]): Record<string, unknown> {
  return {
    id,
    name: String(id),
    nickname: String(id),
    role,
    roleLabel: role,
    faction,
    alive: true,
    canVote: true,
    votes: [],
    seerChecks: [],
    roleConfig: { id: role, name: role, faction, rule: { actions: actions.map((action) => ({ action })) } }
  };
}

function snapshotRepo(target: typeof repo): RepoPatch {
  return {
    upsertActionWindowEpoch: target.upsertActionWindowEpoch,
    listEvents: target.listEvents,
    createAiTask: target.createAiTask,
    listAiTasks: target.listAiTasks,
    listPendingActions: target.listPendingActions
  };
}

function patchRepo(target: typeof repo, patch: Partial<RepoPatch>): void {
  Object.assign(target, patch);
}
