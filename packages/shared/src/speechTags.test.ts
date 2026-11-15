import { describe, expect, it } from 'vitest';
import { parseSpeechTags, stripSpeechTags } from './speechTags';
import { SPEECH_CONTROLS } from './speechControls';

describe('Chinese emotion tags', () => {
  it.each(Object.keys(SPEECH_CONTROLS))('strips the registered %s control in both bracket forms', label => {
    expect(stripSpeechTags(`甲【${label}】乙[${label}]丙`)).toBe('甲乙丙');
  });
  it('keeps pauses at their position and restores rate and pitch within one speech', () => {
    expect(parseSpeechTags('甲[短停][放慢]乙【抬高音调】丙[恢复]丁[长停]').segments).toEqual([
      { text: '甲', style: null },
      { text: '乙', style: null, rateOffset: -15, pauseBeforeMs: 250 },
      { text: '丙', style: null, rateOffset: -15, pitchOffset: 10 },
      { text: '丁', style: null },
      { text: '', style: null, pauseBeforeMs: 900 },
    ]);
    expect(stripSpeechTags('[短停][放慢]你好[恢复语速]。')).toBe('你好。');
  });
  it('maps both bracket forms and applies each tag until the next tag', () => {
    expect(parseSpeechTags('发言：[冷静]先校准一个概念。\n【 愤怒 】请回答！[自然]说完了。')).toEqual({
      text: '发言：先校准一个概念。\n请回答！说完了。', hasTags: true,
      segments: [
        { text: '发言：', style: null },
        { text: '先校准一个概念。\n', style: 'calm' },
        { text: '请回答！', style: 'angry' },
        { text: '说完了。', style: '' },
      ],
    });
  });

  it('preserves ordinary bracketed content, incomplete tags and SSML-like text', () => {
    const text = '[3号]谈到【投票】和[冷静分析]，以及[冷静。<voice>内容</voice>';
    expect(parseSpeechTags(text)).toEqual({ text, hasTags: false, segments: [{ text, style: null }] });
  });

  it('handles repeated tags, aliases, empty text and tags without any dialogue', () => {
    expect(parseSpeechTags('[冷静]【生气】回答')).toMatchObject({ text: '回答', segments: [{ text: '回答', style: 'angry' }] });
    expect(stripSpeechTags('【冷静】')).toBe('');
    expect(stripSpeechTags('')).toBe('');
    expect(stripSpeechTags('普通台词，标点照旧。')).toBe('普通台词，标点照旧。');
    expect(stripSpeechTags('[冷静]甲[3号]乙【愤怒】丙')).toBe('甲[3号]乙丙');
  });
});
