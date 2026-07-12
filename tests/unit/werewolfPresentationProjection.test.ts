import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_WEREWOLF_PRESENTATION, reduceWerewolfPresentation } from '../../packages/client/src/features/werewolf/utils/presentationProjection';

test('werewolf presentation projects legacy and workflow wolf actions through one reducer', () => {
  const workflow = reduceWerewolfPresentation(EMPTY_WEREWOLF_PRESENTATION, {
    type: 'workflow-event',
    workflowEvent: 'werewolf_action_window_opened',
    actionType: 'wolf_vote',
    actionWindow: { actorIds: [1, '2'] },
  });
  assert.deepEqual(workflow, {
    nightActionType: 'wolf-vote',
    nightActionActorIds: [1, 2],
    seerCheckTarget: null,
    hunterShotFromId: null,
  });

  const legacy = reduceWerewolfPresentation(workflow, { type: 'wolf-vote' });
  assert.equal(legacy.nightActionType, 'wolf-vote');
  assert.deepEqual(legacy.nightActionActorIds, []);
});

test('werewolf presentation clears wolf targeting after submission and at phase boundaries', () => {
  const active = { ...EMPTY_WEREWOLF_PRESENTATION, nightActionType: 'wolf-vote', nightActionActorIds: [1, 2] };
  const submitted = reduceWerewolfPresentation(active, {
    type: 'workflow-event',
    workflowEvent: 'werewolf_action_submitted',
    actionType: 'wolf_vote',
  });
  assert.deepEqual(submitted, EMPTY_WEREWOLF_PRESENTATION);

  const reset = reduceWerewolfPresentation(active, { type: 'phase-start', phase: 'night' });
  assert.deepEqual(reset, EMPTY_WEREWOLF_PRESENTATION);
});

test('werewolf presentation projects seer, witch and hunter results consistently', () => {
  const seer = reduceWerewolfPresentation(EMPTY_WEREWOLF_PRESENTATION, {
    type: 'seer-check',
    seerCheck: { target: '8' },
  });
  assert.equal(seer.nightActionType, 'seer-check');
  assert.equal(seer.seerCheckTarget, '8');

  const witch = reduceWerewolfPresentation(seer, {
    type: 'witch-action',
    actionType: 'witch_poison',
    witchAction: { use: true, target: 4 },
  });
  assert.equal(witch.nightActionType, 'witch-poison-action');
  assert.equal(witch.seerCheckTarget, null);

  const hunter = reduceWerewolfPresentation(witch, {
    type: 'workflow-event',
    actionType: 'hunter_shot',
    shot: { from: 7 },
  });
  assert.equal(hunter.hunterShotFromId, 7);
});

test('werewolf presentation ignores unrelated events without allocating new state', () => {
  const current = { ...EMPTY_WEREWOLF_PRESENTATION, nightActionType: 'guard-wake', nightActionActorIds: [5] };
  assert.equal(reduceWerewolfPresentation(current, { type: 'speech' }), current);
});
