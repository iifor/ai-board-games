import { PACKAGE_NAME as GAMES_PACKAGE_NAME } from '@battle/games';
import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('@battle/server', () => {
  it('resolves its workspace dependency on @battle/games', () => {
    expect(PACKAGE_NAME).toBe('@battle/server');
    expect(GAMES_PACKAGE_NAME).toBe('@battle/games');
  });
});
