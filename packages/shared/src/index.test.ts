import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('@battle/shared', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@battle/shared');
  });
});
