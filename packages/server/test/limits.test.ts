import { describe, expect, it } from 'vitest';
import { createCreationLimiter } from '../src/modules/matches';
import { AppError } from '../src/utils/errors';
import { createWindowCounter } from '../src/utils/windowCounter';

describe('window counter', () => {
  it('counts within the window and forgets a key once its entries expire', () => {
    const counter = createWindowCounter(1000);
    expect(counter.record('a', 0)).toBe(1);
    expect(counter.record('a', 500)).toBe(2);
    expect(counter.count('a', 999)).toBe(2);
    // 第一次记录已过期，只剩第二次
    expect(counter.count('a', 1200)).toBe(1);
    expect(counter.size()).toBe(1);
    // 全部过期：访问时整条删除
    expect(counter.count('a', 2000)).toBe(0);
    expect(counter.size()).toBe(0);
  });

  it('sweeps expired keys that are never touched again', () => {
    const counter = createWindowCounter(1000);
    for (let i = 0; i < 100; i += 1) counter.record(`old-${i}`, 0);
    expect(counter.size()).toBe(100);
    // 另一些来源在窗口之后不断到来：旧来源没有再被访问，也会在定期清扫时被移除
    for (let i = 0; i < 300; i += 1) counter.record(`new-${i % 10}`, 5000);
    expect(counter.size()).toBe(10);
    counter.record('late', 9000);
    counter.sweep(9000);
    expect(counter.size()).toBe(1);
  });

  it('clears a key on demand', () => {
    const counter = createWindowCounter(1000);
    counter.record('a', 0);
    counter.clear('a');
    expect(counter.count('a', 1)).toBe(0);
  });
});

describe('creation limiter', () => {
  it('allows ten matches per source per hour and lets the window slide', () => {
    let now = 0;
    const limiter = createCreationLimiter(() => now);
    for (let i = 0; i < 10; i += 1) limiter.check('1.1.1.1');
    expect(() => limiter.check('1.1.1.1')).toThrow(AppError);
    expect(() => limiter.check('2.2.2.2')).not.toThrow();
    now = 60 * 60 * 1000 + 1;
    expect(() => limiter.check('1.1.1.1')).not.toThrow();
  });
});
