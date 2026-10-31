import { PACKAGE_NAME as SHARED_PACKAGE_NAME } from '@battle/shared';
import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('@battle/engine', () => {
  it('resolves its workspace dependency on @battle/shared', () => {
    expect(PACKAGE_NAME).toBe('@battle/engine');
    expect(SHARED_PACKAGE_NAME).toBe('@battle/shared');
  });
});
