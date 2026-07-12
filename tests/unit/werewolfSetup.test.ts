import test from 'node:test';
import assert from 'node:assert/strict';
import { selectAvailableWerewolfMode } from '../../packages/client/src/features/werewolf/utils/setup';

test('werewolf setup keeps an available mode and otherwise selects the first enabled mode', () => {
  const modes = [{ id: 'standard' }, { id: 'guard' }];
  assert.equal(selectAvailableWerewolfMode(modes[1], modes), modes[1]);
  assert.equal(selectAvailableWerewolfMode({ id: 'removed' }, modes), modes[0]);
  assert.equal(selectAvailableWerewolfMode(null, []), null);
});
