import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdSkill } from './animation/skillTiming';
import { SegmentControl } from './playback/segment';

afterEach(() => vi.useRealTimers());
describe('技能展示时间', () => {
  it('倍速变化保留已播放时间，且不覆盖音频进度', async () => {
    vi.useFakeTimers();
    const control = new SegmentControl(1, false);
    control.setProgress({ kind: 'measured', fraction: .3 });
    let ended = false;
    const playing = holdSkill(2200, control).then(() => { ended = true; });
    await vi.advanceTimersByTimeAsync(1000);
    control.setRate(3);
    await vi.advanceTimersByTimeAsync(399);
    expect(ended).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await playing;
    expect(control.progress).toEqual({ kind: 'measured', fraction: .3 });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('跳段立即清理计时器', async () => {
    vi.useFakeTimers();
    const control = new SegmentControl(1, false);
    const playing = holdSkill(2800, control);
    control.abort();
    await playing;
    expect(vi.getTimerCount()).toBe(0);
    await holdSkill(2800, control);
    expect(vi.getTimerCount()).toBe(0);
  });
});
