import { speechOf, type StageEvent } from '@battle/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeEvent, displayDuration } from './playback/describe';
import { dwell, playAudio, present, speak } from './playback/media';
import { SegmentControl, progressFraction } from './playback/segment';
import { meta } from './stage.fixtures';

describe('describeEvent', () => {
  it('maps speeches, votes and eliminations to subtitles', () => {
    expect(describeEvent({ ...meta, kind: 'speech', seat: 1, text: '大家好' })).toEqual({ speaker: 1, text: '大家好' });
    const tally: StageEvent = {
      ...meta, kind: 'vote_tallied', title: '放逐投票', runoff: 0, ballots: [], abstained: [],
      tally: [{ target: 2, votes: 3 }], tied: [], outcome: { kind: 'selected', seat: 2, byTieBreak: false },
    };
    expect(describeEvent(tally).text).toBe('放逐投票：2号 3 票，2号当选');
    expect(describeEvent({ ...meta, kind: 'seat_eliminated', seat: 2, reason: '被放逐' }).text).toBe('2号出局（被放逐）');
    expect(describeEvent({ ...meta, kind: 'fallback', seat: 1, reason: 'x' }).text).toBeNull();
  });

  it('subtitles spoken events with the shared speech text and keeps the acting seat as the speaker', () => {
    const judgement: StageEvent = { ...meta, kind: 'judgement', seat: 3, verdict: 'pro', verdictLabel: '正方胜', comment: '论证更完整' };
    expect(describeEvent(judgement)).toEqual({ speaker: 3, text: speechOf(judgement)?.text });
    expect(describeEvent(judgement).text).toBe('正方胜。论证更完整');
    const action: StageEvent = { ...meta, kind: 'action', seat: 2, action: 'shoot', targets: [5], text: '2号开枪带走了5号' };
    expect(speechOf(action)).toEqual({ text: '2号开枪带走了5号', seat: null });
    expect(describeEvent(action)).toEqual({ speaker: 2, text: '2号开枪带走了5号' });
    const over: StageEvent = { ...meta, kind: 'game_over', result: { winner: 'pro', winnerLabel: '正方胜出', summary: '正方胜出（2:1）', mvp: 1, endReason: 'normal' } };
    expect(describeEvent(over)).toEqual({ speaker: null, text: '正方胜出（2:1）' });
  });

  it('speaks exactly what the shared helper speaks and scales display time with speed', () => {
    expect(speechOf({ ...meta, kind: 'phase_started', title: '立论' })).toBeNull();
    expect(describeEvent({ ...meta, kind: 'phase_started', title: '立论' }).text).toBe('立论');
    expect(speechOf({ ...meta, kind: 'narration', text: '开始' })).toEqual({ text: '开始', seat: null });
    expect(displayDuration('一'.repeat(20), 2)).toBe(displayDuration('一'.repeat(20), 1) / 2);
    expect(displayDuration(null, 1)).toBeLessThan(1000);
  });

  it('does not cap the display time, so a long speech is shown in full when muted', () => {
    expect(displayDuration('一'.repeat(300), 1)).toBe(48000);
  });
});

class FakeAudio {
  static instances: FakeAudio[] = [];
  playbackRate = 1;
  currentTime = 0;
  duration = Number.NaN;
  paused = false;
  readonly listeners = new Map<string, (() => void)[]>();
  constructor(readonly url: string) {
    FakeAudio.instances.push(this);
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
  pause() {
    this.paused = true;
  }
  play() {
    return Promise.resolve();
  }
}

class FakeUtterance {
  lang = '';
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

/** 假的浏览器朗读：记录 speak 调用，朗读永不自行结束 */
function stubSpeechSynthesis() {
  const speakFn = vi.fn();
  vi.stubGlobal('window', { speechSynthesis: { speak: speakFn, cancel: vi.fn() } });
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return speakFn;
}

describe('media playback', () => {
  const text = '一'.repeat(20);
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    FakeAudio.instances = [];
  });

  it('dwells for the text time when the browser refuses to play, instead of finishing instantly', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', class extends FakeAudio {
      override play() {
        return Promise.reject(new Error('NotAllowedError'));
      }
    });
    let finished = false;
    void playAudio('/api/media/x', new SegmentControl(1, false), text).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(displayDuration(text, 1) - 100);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(finished).toBe(true);
  });

  it('dwells by text length when speech synthesis is unavailable', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {});
    let finished = false;
    void speak(text, new SegmentControl(1, false)).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(displayDuration(text, 1) - 100);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(finished).toBe(true);
  });

  it('applies a speed change to the playing audio and reports progress from timeupdate', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    const control = new SegmentControl(1, false);
    let finished = false;
    void playAudio('/api/media/x', control, text).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(0);
    const audio = FakeAudio.instances[0];
    expect(audio?.playbackRate).toBe(1);
    control.setRate(2);
    expect(audio?.playbackRate).toBe(2);
    if (audio) {
      audio.duration = 12;
      audio.currentTime = 3;
      audio.emit('timeupdate');
    }
    expect(control.progress).toEqual({ kind: 'measured', fraction: 0.25 });
    expect(finished).toBe(false);
    audio?.emit('ended');
    await vi.advanceTimersByTimeAsync(0);
    expect(finished).toBe(true);
  });

  it('stops the audio when muted and dwells for the remaining text time', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    const control = new SegmentControl(1, false);
    let finished = false;
    void playAudio('/api/media/x', control, text).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(0);
    const audio = FakeAudio.instances[0];
    if (audio) {
      audio.duration = 10;
      audio.currentTime = 5;
    }
    control.mute();
    expect(audio?.paused).toBe(true);
    expect(control.progress).toMatchObject({ kind: 'timed', fraction: 0.5, remainingMs: displayDuration(text, 1) / 2 });
    await vi.advanceTimersByTimeAsync(displayDuration(text, 1) / 2 - 100);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(finished).toBe(true);
  });

  it('rescales the remaining dwell when the speed changes mid-way', async () => {
    vi.useFakeTimers();
    const control = new SegmentControl(1, false);
    let finished = false;
    void dwell(control, text).then(() => { finished = true; });
    const total = displayDuration(text, 1);
    await vi.advanceTimersByTimeAsync(total / 2);
    control.setRate(2);
    expect(control.progress).toMatchObject({ kind: 'timed', fraction: 0.5, remainingMs: total / 4 });
    expect(progressFraction(control.progress, Date.now() + total / 8)).toBeCloseTo(0.75, 5);
    await vi.advanceTimersByTimeAsync(total / 4 - 100);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(finished).toBe(true);
  });
});

describe('present', () => {
  const action: StageEvent = { ...meta, kind: 'action', seat: 2, action: 'shoot', targets: [5], text: '2号开枪带走了5号' };
  const phase: StageEvent = { ...meta, kind: 'phase_started', title: '立论' };
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    FakeAudio.instances = [];
  });

  it('plays the server audio when there is one, reads other spoken events with the browser voice and only dwells on the rest', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    const speakFn = stubSpeechSynthesis();
    const withAudio = new SegmentControl(1, false);
    void present({ event: action, audio: { url: '/api/media/a', mime: 'audio/mpeg' } }, withAudio);
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeAudio.instances.map((audio) => audio.url)).toEqual(['/api/media/a']);
    expect(speakFn).not.toHaveBeenCalled();
    withAudio.abort();

    const voice = new SegmentControl(1, false);
    void present({ event: action, audio: null }, voice);
    expect(speakFn).toHaveBeenCalledTimes(1);
    expect(speakFn.mock.calls[0]?.[0]).toMatchObject({ text: '2号开枪带走了5号', lang: 'zh-CN' });
    voice.abort();

    let dwelt = false;
    void present({ event: phase, audio: null }, new SegmentControl(1, false)).then(() => { dwelt = true; });
    await vi.advanceTimersByTimeAsync(displayDuration('立论', 1) + 1);
    expect(dwelt).toBe(true);
    expect(speakFn).toHaveBeenCalledTimes(1);
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it('dwells by text length instead of playing or speaking when muted', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    const speakFn = stubSpeechSynthesis();
    let finished = false;
    void present({ event: action, audio: { url: '/api/media/a', mime: 'audio/mpeg' } }, new SegmentControl(1, true)).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(displayDuration(action.text, 1) - 100);
    expect(FakeAudio.instances).toHaveLength(0);
    expect(speakFn).not.toHaveBeenCalled();
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(finished).toBe(true);
  });
});
