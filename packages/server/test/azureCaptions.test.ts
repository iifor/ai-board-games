import { describe, expect, it } from 'vitest';
import { azureCaptionCues } from '../src/modules/tts/azureCaptions';

describe('Azure subtitle alignment', () => {
  it('keeps repeated dialogue in order and uses the real pause and slower second sentence', () => {
    expect(azureCaptionCues('你好。你好！', [
      { text: '你好', startMs: 50.2, endMs: 550.4 },
      { text: '。', startMs: 550.4, endMs: 550.4 },
      { text: '你好', startMs: 1500.1, endMs: 2400.3 },
      { text: '！', startMs: 2400.3, endMs: 2400.3 },
    ])).toEqual([
      { text: '你好。', startMs: 50, endMs: 550 },
      { text: '你好！', startMs: 1500, endMs: 2400 },
    ]);
  });

  it('aligns decoded text and Unicode even when punctuation is not returned', () => {
    expect(azureCaptionCues('“A&B”，你好😀。', [
      { text: 'A&B', startMs: 10, endMs: 300 },
      { text: '你好', startMs: 400, endMs: 700 },
    ])).toEqual([{ text: '“A&B”，你好😀。', startMs: 10, endMs: 700 }]);
  });

  it('does not invent timestamps when meaningful text or timing is missing or invalid', () => {
    const valid = { text: '甲', startMs: 50, endMs: 200 };
    expect(azureCaptionCues('甲乙', [valid])).toBeUndefined();
    expect(azureCaptionCues('乙甲', [valid])).toBeUndefined();
    expect(azureCaptionCues('甲', [])).toBeUndefined();
    expect(azureCaptionCues('甲', [{ ...valid, endMs: NaN }])).toBeUndefined();
    expect(azureCaptionCues('甲', [{ ...valid, endMs: 20 }])).toBeUndefined();
    expect(azureCaptionCues('甲甲', [valid, { ...valid, startMs: 10 }])).toBeUndefined();
  });

  it('keeps an indivisible long Azure token together instead of claiming different start times', () => {
    const text = 'a'.repeat(100);
    expect(azureCaptionCues(text, [{ text, startMs: 50, endMs: 1000 }]))
      .toEqual([{ text, startMs: 50, endMs: 1000 }]);
  });
});
