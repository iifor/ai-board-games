import test from 'node:test';
import assert from 'node:assert/strict';
import { assertWerewolfWorkflowCompleted } from '../../packages/server/modules/werewolf/workflow';

test('werewolf runner accepts completed matches and debug pauses only when allowed', () => {
  assert.doesNotThrow(() => assertWerewolfWorkflowCompleted({ status: 'completed' }));
  assert.doesNotThrow(() => assertWerewolfWorkflowCompleted(
    { status: 'paused_debug' },
    { allowPausedDebug: true },
  ));

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
