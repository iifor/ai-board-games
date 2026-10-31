import { PACKAGE_NAME as ENGINE_PACKAGE_NAME } from '@battle/engine';
import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('@battle/games', () => {
  it('resolves its workspace dependency on @battle/engine', () => {
    expect(PACKAGE_NAME).toBe('@battle/games');
    expect(ENGINE_PACKAGE_NAME).toBe('@battle/engine');
  });
});
