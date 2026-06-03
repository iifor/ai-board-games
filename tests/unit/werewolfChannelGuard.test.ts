import test from 'node:test';
import assert from 'node:assert/strict';
import { guardWerewolfWorkflowEventChannel } from '../../packages/server/modules/werewolf/handlers/channelGuard';
import { createWerewolfEvent } from '../../packages/server/modules/werewolf/handlers/common';

test('Werewolf channel guard upgrades private phase results to scoped channel', () => {
  const guarded = guardWerewolfWorkflowEventChannel({
    workflowEvent: 'werewolf_phase_result',
    payload: {
      actionType: 'seer_check',
      seerResult: '狼人',
      target: 8,
    },
    channel: 'public',
  });

  assert.equal(guarded.channel, 'scope');
  assert.equal(guarded.scopeKey, 'seer');
  assert.equal(guarded.invariantIssues?.[0].code, 'PRIVATE_ACTION_CHANNEL_MISMATCH');
});

test('Werewolf channel guard keeps public phase prompts without private payload public', () => {
  const guarded = guardWerewolfWorkflowEventChannel({
    workflowEvent: 'werewolf_phase_start',
    payload: {
      actionType: 'seer_check',
      message: '预言家请睁眼',
    },
    channel: 'public',
  });

  assert.equal(guarded.channel, 'public');
  assert.equal(guarded.scopeKey, undefined);
  assert.equal(guarded.invariantIssues, undefined);
});

test('createWerewolfEvent never publishes private seer result as public', () => {
  const event = createWerewolfEvent(
    { id: 'match-channel' },
    { id: 'seer_check_1' },
    { players: [], rounds: [] },
    'werewolf_phase_result',
    '它的身份是狼人',
    { actionType: 'seer_check', seerResult: '狼人', target: 8 },
    { channel: 'public' },
  );

  assert.equal(event.channel, 'scope');
  assert.equal(event.scopeKey, 'seer');
  assert.equal(event.payload.channel, 'scope');
  assert.equal(event.payload.scopeKey, 'seer');
  assert.equal(Array.isArray(event.payload.channelInvariantIssues), true);
});
