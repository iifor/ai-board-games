import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioUnlockButton } from './components/AudioUnlockPrompt';
import { isAutoplayBlocked, resetAudioUnlockForTest, subscribeAutoplayBlocked, unlockAudio } from './playback/audioUnlock';
import { displayDuration } from './playback/describe';
import { playAudio, speak } from './playback/media';
import { playSegment } from './playback/playSegment';
import { SegmentControl } from './playback/segment';
import { meta } from './stage.fixtures';
import type { StreamItem } from './types';

const notAllowed = () => Object.assign(new Error('play() failed because the user didn\'t interact first'), { name: 'NotAllowedError' });

/** 假的音频元素：play 的结果由 nextPlay 决定，src 可改（解锁后复用同一个元素） */
class FakeAudio {
  static instances: FakeAudio[] = [];
  static nextPlay: () => Promise<void> = () => Promise.resolve();
  playbackRate = 1;
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  readonly listeners = new Map<string, (() => void)[]>();
  constructor(public src = '') {
    FakeAudio.instances.push(this);
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  pause() {
    this.paused = true;
  }
  play() {
    this.paused = false;
    return FakeAudio.nextPlay();
  }
}

const item: StreamItem = { event: { ...meta, seq: 7, kind: 'narration', text: '天亮了' }, audio: null };
const text = '一'.repeat(20);

beforeEach(() => {
  resetAudioUnlockForTest();
  FakeAudio.instances = [];
  FakeAudio.nextPlay = () => Promise.resolve();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('playSegment', () => {
  it('logs a failed segment and still advances, so the stage and the ack-paced match keep going', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const done = vi.fn();
    await playSegment(item, new SegmentControl(1, false), () => Promise.reject(new Error('decode failed')), done);
    expect(done).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });

  it('also advances when presenting throws synchronously', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const done = vi.fn();
    await playSegment(item, new SegmentControl(1, false), () => { throw new Error('boom'); }, done);
    expect(done).toHaveBeenCalledOnce();
  });

  it('does not advance a segment that was aborted (unmount or match switch)', async () => {
    const control = new SegmentControl(1, false);
    const done = vi.fn();
    const running = playSegment(item, control, () => Promise.resolve(), done);
    control.abort();
    await running;
    expect(done).not.toHaveBeenCalled();
  });
});

describe('blocked autoplay', () => {
  it('reports a NotAllowedError and keeps advancing by text length', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    FakeAudio.nextPlay = () => Promise.reject(notAllowed());
    const changes = vi.fn();
    subscribeAutoplayBlocked(changes);
    let finished = false;
    void playAudio('/api/media/a', new SegmentControl(1, false), text).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(isAutoplayBlocked()).toBe(true);
    expect(changes).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(displayDuration(text, 1) + 100);
    expect(finished).toBe(true);
  });

  it('does not treat other playback failures as blocked autoplay', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    FakeAudio.nextPlay = () => Promise.reject(new Error('network'));
    void playAudio('/api/media/a', new SegmentControl(1, false), text);
    await vi.advanceTimersByTimeAsync(0);
    expect(isAutoplayBlocked()).toBe(false);
  });

  it('reports browser speech refused before a user gesture', () => {
    const utterances: { onerror: ((event: { error: string }) => void) | null }[] = [];
    vi.stubGlobal('window', { speechSynthesis: { speak: (u: (typeof utterances)[number]) => utterances.push(u), cancel: vi.fn() } });
    vi.stubGlobal('SpeechSynthesisUtterance', class { lang = ''; rate = 1; onend = null; onerror = null; constructor(readonly text: string) {} });
    const control = new SegmentControl(1, false);
    void speak(text, control);
    utterances[0]?.onerror?.({ error: 'not-allowed' });
    expect(isAutoplayBlocked()).toBe(true);
    control.abort();
  });

  it('unlocks one reusable element in the click, then plays later segments through it', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    FakeAudio.nextPlay = () => Promise.reject(notAllowed());
    const blockedSegment = new SegmentControl(1, false);
    void playAudio('/api/media/a', blockedSegment, text);
    await Promise.resolve();
    await Promise.resolve();
    expect(isAutoplayBlocked()).toBe(true);
    blockedSegment.abort();

    FakeAudio.nextPlay = () => Promise.resolve();
    await unlockAudio();
    expect(isAutoplayBlocked()).toBe(false);
    const unlocked = FakeAudio.instances.at(-1);
    expect(unlocked?.src).toMatch(/^data:audio\/wav/);

    const next = new SegmentControl(1, false);
    void playAudio('/api/media/b', next, text);
    expect(FakeAudio.instances.at(-1)).toBe(unlocked);
    expect(unlocked?.src).toBe('/api/media/b');
    expect(unlocked?.paused).toBe(false);
    next.abort();
  });

  it('keeps the prompt when unlocking fails so the viewer can try again', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    FakeAudio.nextPlay = () => Promise.reject(notAllowed());
    const segment = new SegmentControl(1, false);
    void playAudio('/api/media/a', segment, text);
    await Promise.resolve();
    await Promise.resolve();
    await expect(unlockAudio()).rejects.toThrow();
    expect(isAutoplayBlocked()).toBe(true);
    segment.abort();
  });

  it('renders the unlock prompt only when audio is blocked', () => {
    expect(renderToStaticMarkup(<AudioUnlockButton visible={false} onUnlock={() => undefined} />)).toBe('');
    const html = renderToStaticMarkup(<AudioUnlockButton visible onUnlock={() => undefined} />);
    expect(html).toContain('点击开启声音');
    expect(html).toContain('type="button"');
  });
});
