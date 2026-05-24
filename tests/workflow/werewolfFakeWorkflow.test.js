const test = require('node:test');
const assert = require('node:assert/strict');
const repo = require('../../server/modules/workflow-engine/repository');
const { createActionWindowHandler } = require('../../server/modules/werewolf/handlers/actionWindowHandler');
const { createNightResolveHandler, createExileResolveHandler } = require('../../server/modules/werewolf/handlers/resolveHandlers');
const { createRound } = require('../../server/modules/werewolf/agents');

test('fake werewolf action window opens, completes, and night resolve emits effects', () => {
  const original = snapshotRepo(repo);
  const tasks = [];
  const epochs = [];
  try {
    repo.upsertActionWindowEpoch = (epoch) => epochs.push(epoch);
    repo.listEvents = () => [];
    repo.createAiTask = (task) => tasks.push({ ...task, status: task.status || 'queued', result: null });
    repo.listPendingActions = () => [];
    repo.listAiTasks = () => tasks;

    const state = createState();
    const match = { id: 'm-fake', config: { players: state.players }, createdAt: 'now' };
    const wolfStep = { id: 'wolf_kill_1', type: 'werewolf.action_window', config: { day: 1, phase: 'night', actionType: 'wolf_kill' } };
    const actionHandler = createActionWindowHandler();

    const opened = actionHandler.execute({ match, step: wolfStep, state });
    assert.equal(opened.status, 'WAITING');
    assert.equal(opened.tasks.length, 1);
    assert.equal(opened.events[0].type, 'werewolf_action_requested');
    tasks.push(...opened.tasks);

    tasks[0] = {
      ...tasks[0],
      status: 'succeeded',
      playerId: 1,
      result: { payload: { target: 2, speech: 'target 2' } }
    };
    const completed = actionHandler.execute({ match, step: wolfStep, state: opened.state });
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.state.rounds[0].night.wolfTarget, 2);

    const nightResolved = createNightResolveHandler().execute({
      match,
      step: { id: 'night_resolve_1', type: 'werewolf.night_resolve', config: { day: 1, phase: 'night' } },
      state: completed.state
    });
    assert.equal(nightResolved.status, 'COMPLETED');
    assert.equal(nightResolved.events[0].type, 'werewolf_effect_resolved');
    assert.equal(nightResolved.state.players.find((player) => Number(player.id) === 2).alive, false);

    const dayVotedState = {
      ...nightResolved.state,
      rounds: [{ ...nightResolved.state.rounds[0], votes: { 1: 3, 3: 3 } }]
    };
    const exileResolved = createExileResolveHandler().execute({
      match,
      step: { id: 'exile_resolve_1', type: 'werewolf.exile_resolve', config: { day: 1, phase: 'day' } },
      state: dayVotedState
    });
    assert.equal(exileResolved.status, 'COMPLETED');
    assert.equal(exileResolved.state.rounds[0].exile.id, 3);
  } finally {
    restoreRepo(repo, original);
  }
});

function createState() {
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

function player(id, role, faction, actions) {
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

function snapshotRepo(target) {
  return {
    upsertActionWindowEpoch: target.upsertActionWindowEpoch,
    listEvents: target.listEvents,
    createAiTask: target.createAiTask,
    listAiTasks: target.listAiTasks,
    listPendingActions: target.listPendingActions
  };
}

function restoreRepo(target, original) {
  Object.assign(target, original);
}
