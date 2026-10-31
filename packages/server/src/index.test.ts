import { gameRegistry } from '@battle/games';
import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('@battle/server', () => {
  it('resolves the game registry from @battle/games', () => {
    expect(PACKAGE_NAME).toBe('@battle/server');
    expect(gameRegistry.has('debate')).toBe(true);
  });
});
