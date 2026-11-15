import { describe, expect, it } from 'vitest';
import { captionIndexAt, captionIndexAtTime, sentenceCues } from './playback/captions';
import { progressFraction, type SegmentProgress } from './playback/segment';

describe('Azure caption timeline', () => {
  it('waits for actual spoken time and keeps the previous sentence during a pause', () => {
    const cues = [{ text: '第一句。', startMs: 50, endMs: 900 }, { text: '第二句。', startMs: 1900, endMs: 4000 }];
    expect(captionIndexAtTime(cues, 0)).toBe(-1);
    expect(captionIndexAtTime(cues, 50)).toBe(0);
    expect(captionIndexAtTime(cues, 1800)).toBe(0);
    expect(captionIndexAtTime(cues, 1900)).toBe(1);
    expect(captionIndexAtTime(cues, 4500)).toBe(1);
    expect(captionIndexAtTime([], 50)).toBe(-1);
    expect(captionIndexAtTime(cues, NaN)).toBe(-1);
  });
});

describe('sentence captions', () => {
  it('keeps sentence punctuation, quotation marks and paragraph boundaries', () => {
    expect(sentenceCues('他说：“先听理由。”再看投票！\n最后一段').map(c=>c.text))
      .toEqual(['他说：“先听理由。”', '再看投票！', '最后一段']);
  });

  it('preserves decimal values and English sentences', () => {
    expect(sentenceCues('Use 1.5 times speed. Then continue!').map(c=>c.text))
      .toEqual(['Use 1.5 times speed.', 'Then continue!']);
  });

  it('breaks very long sentences into readable pieces without losing characters', () => {
    const text='大家先回顾这轮的发言，'.repeat(15)+'再进行投票。';
    const cues=sentenceCues(text);
    expect(cues.every(cue=>Array.from(cue.text).length<=42)).toBe(true);
    expect(cues.map(c=>c.text).join('')).toBe(text);
  });

  it('preserves emoji when a sentence exceeds the caption width', () => {
    const text='👩‍💻'.repeat(30);
    const cues=sentenceCues(text);
    expect(cues.map(c=>c.text).join('')).toBe(text);
    expect(cues.every(cue=>!/[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/u.test(cue.text))).toBe(true);
  });

  it('holds each sentence until its boundary and keeps the last one at the end', () => {
    const cues=sentenceCues('第一句。第二句话。');
    expect(cues[0]?.start).toBe(0);
    expect(cues.at(-1)?.end).toBe(1);
    expect(captionIndexAt(cues,0)).toBe(0);
    expect(captionIndexAt(cues,cues[0]!.end-.0001)).toBe(0);
    expect(captionIndexAt(cues,cues[0]!.end)).toBe(1);
    expect(captionIndexAt(cues,1)).toBe(1);
    expect(captionIndexAt(cues,5)).toBe(1);
    expect(captionIndexAt(cues,NaN)).toBe(0);
    expect(captionIndexAt([],0)).toBe(-1);
  });

  it('follows the same timed clock when playback speed changes', () => {
    const cues=sentenceCues('第一句。第二句。');
    const normal:SegmentProgress={kind:'timed',fraction:0,startedAt:0,remainingMs:1000};
    expect(captionIndexAt(cues,progressFraction(normal,400))).toBe(0);
    const faster:SegmentProgress={kind:'timed',fraction:.4,startedAt:400,remainingMs:300};
    expect(captionIndexAt(cues,progressFraction(faster,500))).toBe(1);
  });

  it('ignores empty paragraphs', () => {
    expect(sentenceCues('  \n\n ')).toEqual([]);
  });
});
