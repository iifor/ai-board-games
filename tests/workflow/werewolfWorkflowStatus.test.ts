import test from 'node:test';
import assert from 'node:assert/strict';
import { assertWerewolfWorkflowCompleted } from '../../packages/server/modules/werewolf/workflow';

test('werewolf runner accepts only completed workflow matches', () => {
  assert.doesNotThrow(() => assertWerewolfWorkflowCompleted({ status: 'completed' }));

  for (const status of ['paused_debug', 'failed', 'waiting']) {
    assert.throws(
      () => assertWerewolfWorkflowCompleted({
        status,
        error: { message: 'advance failed' },
      }),
      new RegExp(`${status}.*advance failed`),
    );
  }
});
