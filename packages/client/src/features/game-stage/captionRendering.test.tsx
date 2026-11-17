import type { StageEvent } from '@battle/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SentenceCaptions } from './components/SentenceCaptions';
import { SpeechLine } from './components/SpeechLine';
import { SubtitleBar } from './components/SubtitleBar';
import { sentenceCues } from './playback/captions';
import { SegmentControl } from './playback/segment';
import { speechLineParts } from './playback/speechTurns';
import { meta, view } from './stage.fixtures';

const tagged = '【冷静】先核对[3号]的【投票】。【停顿】[放慢]再做决定。';
const clean = '先核对[3号]的【投票】。再做决定。';
const speech = { ...meta, kind: 'speech', seat: 1, text: tagged } as const satisfies StageEvent;

describe('spoken text shown without delivery tags', () => {
  it('cleans the central speech without changing its original event or ordinary brackets', () => {
    const html = renderToStaticMarkup(<SpeechLine event={speech} />);
    expect(html).toContain(clean);
    expect(html).not.toMatch(/冷静|停顿|放慢/);
    expect(speech.text).toBe(tagged);
  });

  it('cleans judgement text while keeping its verdict and debug attribution', () => {
    const judgement = { ...meta, kind: 'judgement', seat: 1, verdict: 'pro', verdictLabel: '正方胜', comment: '【调试】1号 玩家1【冷静】论证完整。【停顿】继续。' } as const;
    expect(speechLineParts(judgement)).toEqual({ prefix: '正方胜。【调试】', speaker: '1号 玩家1', body: '论证完整。继续。' });
  });

  it('labels a key-action aside as the speaker\'s inner line, not a public speech', () => {
    const aside = { ...meta, kind: 'speech', seat: 1, purpose: 'aside', channel: 'spectator', text: '这瓶药我赌他是好人' } as const satisfies StageEvent;
    expect(speechLineParts(aside).speaker).toContain('心里话');
    expect(speechLineParts(speech).speaker).not.toContain('心里话');
    expect(renderToStaticMarkup(<SentenceCaptions item={{ event: aside, audio: null }} control={new SegmentControl(1, false)} />)).toContain('心里话');
  });

  it('cleans the subtitle bar and its screen reader text', () => {
    const html = renderToStaticMarkup(<SubtitleBar item={{ event: speech, audio: null }} view={view} />);
    expect(html).toContain(clean);
    expect(html).not.toMatch(/冷静|停顿|放慢/);
  });

  it('cleans stage announcements in the quiet screen reader region', () => {
    const event: StageEvent = { ...meta, kind: 'phase_started', title: '夜晚', announcement: '【停顿】狼人请睁眼。' };
    const html = renderToStaticMarkup(<SubtitleBar item={{ event, audio: null }} view={view} quietIdle />);
    expect(html).toContain('狼人请睁眼。');
    expect(html).not.toContain('停顿');
  });

  it('cleans timestamped captions supplied by an older cache without changing cue times', () => {
    const control = new SegmentControl(2, false);
    control.setProgress({ kind: 'measured', fraction: 0.5, positionMs: 1500 });
    const captions = [{ text: tagged, startMs: 50, endMs: 3000 }];
    const html = renderToStaticMarkup(<SentenceCaptions item={{ event: speech, audio: { url: '/api/media/test', mime: 'audio/mpeg', captions } }} control={control} />);
    expect(html).toContain(clean);
    expect(html).not.toMatch(/冷静|停顿|放慢/);
    expect(captions[0]).toEqual({ text: tagged, startMs: 50, endMs: 3000 });
  });

  it('cleans estimated subtitles and tag-only captions', () => {
    expect(sentenceCues(tagged).map(cue => cue.text).join('')).toBe(clean);
    const event = { ...speech, text: '【停顿】[冷静]' };
    expect(renderToStaticMarkup(<SentenceCaptions item={{ event, audio: null }} control={null} />)).toBe('');
    expect(renderToStaticMarkup(<SubtitleBar item={{ event, audio: null }} view={view} quietIdle />)).not.toMatch(/停顿|冷静/);
  });
});
