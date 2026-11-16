import { isPlayerSpeech, speechOf, type StageEvent } from '@battle/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeEvent, displayDuration } from './playback/describe';
import { dwell, playAudio, present, speak } from './playback/media';
import { SegmentControl, progressFraction } from './playback/segment';
import { AUDIO_STALL_MS, SPEECH_WATCHDOG_FACTOR, SPEECH_WATCHDOG_GRACE_MS } from './constants';
import { meta } from './stage.fixtures';

describe('describeEvent', () => {
  it('maps speeches, votes and eliminations to subtitles', () => {
    expect(describeEvent({ ...meta, kind: 'speech', seat: 1, text: '大家好' })).toEqual({ speaker: 1, text: '大家好' });
    const tally: StageEvent = {
      ...meta, view: { ...meta.view, gameKey: 'werewolf' }, phaseId: 'exile_vote', kind: 'vote_tallied', title: '放逐投票', runoff: 0, ballots: [], abstained: [],
      tally: [{ target: 2, votes: 3 }], tied: [], outcome: { kind: 'selected', seat: 2, byTieBreak: false },
    };
    expect(describeEvent(tally).text).toBeNull();
    expect(describeEvent({ ...meta, view: tally.view, kind: 'seat_eliminated', seat: 2, reason: '被放逐' }).text).toBeNull();
    expect(describeEvent({ ...meta, kind: 'fallback', seat: 1, reason: 'x' }).text).toBeNull();
  });

  it('subtitles spoken events with the shared speech text and keeps the acting seat as the speaker', () => {
    const judgement: StageEvent = { ...meta, kind: 'judgement', seat: 3, verdict: 'pro', verdictLabel: '正方胜', comment: '论证更完整' };
    expect(describeEvent(judgement)).toEqual({ speaker: 3, text: speechOf(judgement)?.text });
    expect(describeEvent(judgement).text).toBe('正方胜。论证更完整');
    const fallback = { ...judgement, source: 'fallback' as const, comment: '3号本轮未能发言。判定由系统代选。' };
    expect(isPlayerSpeech(fallback)).toBe(false);
    expect(describeEvent(fallback)).toEqual({ speaker: null, text: '3号本轮未能发言。判定由系统代选。结果为正方胜。' });
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

  it('does not speak emotion tags when cloud audio falls back to browser speech', async () => {
    const speakFn = stubSpeechSynthesis();
    const control = new SegmentControl(1, false);
    const done = speak('[冷静]先校准一个概念【愤怒】请回答', control);
    expect(speakFn.mock.calls[0]?.[0]).toMatchObject({ text: '先校准一个概念请回答' });
    control.abort();
    await done;
    await speak('[冷静]', new SegmentControl(1, false));
    expect(speakFn).toHaveBeenCalledOnce();
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

  it('finishes browser speech that never reports its end, so the segment is still acknowledged', async () => {
    vi.useFakeTimers();
    stubSpeechSynthesis();
    let finished = false;
    void speak(text, new SegmentControl(1, false)).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(displayDuration(text, 1) * SPEECH_WATCHDOG_FACTOR);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(SPEECH_WATCHDOG_GRACE_MS);
    expect(finished).toBe(true);
  });

  it('dwells for the rest of the text when server audio stops making progress without an error', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    let finished = false;
    void playAudio('/api/media/x', new SegmentControl(1, false), text).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(0);
    const audio = FakeAudio.instances[0];
    if (audio) {
      audio.duration = 10;
      audio.currentTime = 5;
      audio.emit('timeupdate');
    }
    // 有进度时不触发；之后卡住不动，到期改为停留剩余一半的展示时间
    await vi.advanceTimersByTimeAsync(AUDIO_STALL_MS - 100);
    expect(audio?.paused).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(audio?.paused).toBe(true);
    await vi.advanceTimersByTimeAsync(displayDuration(text, 1) / 2 - 300);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
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
    control.setRate(1.25);
    expect(audio?.playbackRate).toBe(1.25);
    control.setRate(2);
    expect(audio?.playbackRate).toBe(2);
    if (audio) {
      audio.duration = 12;
      audio.currentTime = 3;
      audio.emit('timeupdate');
    }
    expect(control.progress).toEqual({ kind: 'measured', fraction: 0.25, positionMs: 3000 });
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

  it('shows the sheriff’s direction animation silently and ignores cached direction audio', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    const speakFn = stubSpeechSynthesis();
    const direction: StageEvent = { ...action, phaseId: 'speech_direction', action: '指定发言顺序', targets: [2],
      text: '指定从 2号 开始发言', view: { ...meta.view, gameKey: 'werewolf' } };
    const playback = present({ event: direction, audio: { url: '/cached-direction.mp3', mime: 'audio/mpeg' } }, new SegmentControl(1, false));
    await vi.runAllTimersAsync();
    await playback;
    expect(describeEvent(direction).text).toBeNull();
    expect(speakFn).not.toHaveBeenCalled();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it.each([
    ['blade', '狼刀命中'], ['heal', '解药生效 · 挡下狼刀'], ['shield', '守护成功 · 挡下狼刀'], ['dream', '梦游避开狼刀'],
  ])('keeps the %s animation silent even when the replay carries cached audio', async (effect, title) => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    const speakFn = stubSpeechSynthesis();
    const hit: StageEvent = { ...meta, view: { ...meta.view, gameKey: 'werewolf' }, phaseId: 'night_resolve',
      channel: 'spectator', kind: 'revealed', text: `6号 · ${title}`, data: { target: 6, title, effect } };
    const playback = present({ event: hit, audio: { url: '/cached-hit.mp3', mime: 'audio/mpeg' } }, new SegmentControl(1, false));
    await vi.runAllTimersAsync();
    await playback;
    expect(speakFn).not.toHaveBeenCalled();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('keeps the silent exile tally visible long enough to read fractional votes', async () => {
    vi.useFakeTimers();
    const tally: StageEvent = {
      ...meta, view: { ...meta.view, gameKey: 'werewolf' }, phaseId: 'exile_vote',
      kind: 'vote_tallied', title: '放逐投票', runoff: 0, ballots: [], abstained: [],
      tally: [{ target: 2, votes: 11.5 }, { target: 1, votes: 1 }], tied: [],
      outcome: { kind: 'selected', seat: 2, byTieBreak: false },
    };
    let finished = false;
    void present({ event: tally, audio: null }, new SegmentControl(1, false)).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(3000);
    expect(finished).toBe(false);
    await vi.runAllTimersAsync();
    expect(finished).toBe(true);
  });

  it.each([
    { phaseId: 'sheriff_signup', targets: [2] }, { phaseId: 'sheriff_signup', targets: [] },
    { phaseId: 'sheriff_withdraw', targets: [2] }, { phaseId: 'sheriff_withdraw', targets: [] },
  ])('shows sheriff choice without cached audio or browser speech: $phaseId $targets', async ({ phaseId, targets }) => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    const speakFn = stubSpeechSynthesis();
    const signup: StageEvent = { ...action, phaseId, targets, view: { ...meta.view, gameKey: 'werewolf' } };
    expect(describeEvent(signup).text).toBeNull();
    for (const muted of [false, true]) {
      let finished = false;
      void present({ event: signup, audio: { url: '/cached-signup.mp3', mime: 'audio/mpeg' } }, new SegmentControl(2, muted))
        .then(() => { finished = true; });
      await vi.advanceTimersByTimeAsync(199);
      expect(finished).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(finished).toBe(true);
      expect(FakeAudio.instances).toHaveLength(0);
      expect(speakFn).not.toHaveBeenCalled();
    }
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

  it('speaks the same public wake-up line as the host caption and keeps it visible when muted', async () => {
    vi.useFakeTimers();
    const speakFn = stubSpeechSynthesis();
    const wake: StageEvent = { ...phase, phaseId: 'wolf_chat', view: { ...meta.view, gameKey: 'werewolf' },
      kind: 'phase_started', title: '狼人夜聊', announcement: '狼人请睁眼。' };
    expect(describeEvent(wake)).toEqual({ speaker: null, text: '狼人请睁眼。' });
    const voice = new SegmentControl(1, false);
    const speaking = present({ event: wake, audio: null }, voice);
    expect(speakFn.mock.calls[0]?.[0]).toMatchObject({ text: '狼人请睁眼。', lang: 'zh-CN' });
    voice.abort();
    await speaking;
    const muted = present({ event: wake, audio: null }, new SegmentControl(1, true));
    await vi.advanceTimersByTimeAsync(displayDuration('狼人请睁眼。', 1));
    await muted;
    expect(speakFn).toHaveBeenCalledTimes(1);
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
