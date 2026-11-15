import { AZURE_STYLE_LABELS } from './azureStyles';
import { speechControl } from './speechControls';

/** 中文朗读标记的明确映射；只识别登记项，保留座号、引用等普通括号内容。 */
const EMOTION_STYLES: Readonly<Record<string, string>> = {
  自然: '', 默认: '', 正常: '',
  冷静: 'calm', 平静: 'calm', 愤怒: 'angry', 生气: 'angry',
  欢快: 'cheerful', 开心: 'cheerful', 高兴: 'cheerful', 兴奋: 'excited',
  悲伤: 'sad', 难过: 'sad', 低落: 'depressed', 沮丧: 'depressed',
  严肃: 'serious', 严厉: 'strict', 不满: 'disgruntled', 抱怨: 'complaining',
  害怕: 'fearful', 恐惧: 'fearful', 惊恐: 'terrified', 紧张: 'nervous',
  温柔: 'gentle', 友好: 'friendly', 亲切: 'affectionate', 安慰: 'comforting',
  共情: 'empathetic', 鼓励: 'encouraging', 希望: 'hopeful',
  耳语: 'whispering', 低语: 'whispering', 喊叫: 'shouting', 大喊: 'shouting',
  尴尬: 'embarrassed', 害羞: 'shy', 好奇: 'curious', 惊讶: 'surprised',
  困惑: 'confused', 坚定: 'determined', 内疚: 'guilty', 抱歉: 'sorry',
  疲惫: 'tired', 焦虑: 'anxious', 怀疑: 'skeptical', 讽刺: 'sarcastic',
  ...Object.fromEntries(Object.entries(AZURE_STYLE_LABELS).map(([style, label]) => [label, style])),
};

export interface TaggedSpeechSegment {
  readonly text: string;
  /** null 表示沿用音色配置，空字符串表示显式恢复自然风格。 */
  readonly style: string | null;
  readonly rateOffset?: number;
  readonly pitchOffset?: number;
  readonly pauseBeforeMs?: number;
}

export function parseSpeechTags(text: string): { readonly text: string; readonly segments: readonly TaggedSpeechSegment[]; readonly hasTags: boolean } {
  const segments: TaggedSpeechSegment[] = [];
  let position = 0;
  let style: string | null = null;
  let hasTags = false;
  let rateOffset = 0;
  let pitchOffset = 0;
  let pauseBeforeMs = 0;
  const emit = (content: string) => {
    if (!content && !pauseBeforeMs) return;
    segments.push({ text: content, style,
      ...(rateOffset ? { rateOffset } : {}), ...(pitchOffset ? { pitchOffset } : {}),
      ...(pauseBeforeMs ? { pauseBeforeMs } : {}),
    });
    pauseBeforeMs = 0;
  };
  const pattern = /\[([^\[\]\r\n]{1,16})\]|【([^【】\r\n]{1,16})】/gu;
  for (const match of text.matchAll(pattern)) {
    const label = (match[1] ?? match[2] ?? '').trim();
    const control = speechControl(label);
    if (!control && !Object.hasOwn(EMOTION_STYLES, label)) continue;
    const content = text.slice(position, match.index);
    if (content) emit(content);
    if (!control) style = EMOTION_STYLES[label] ?? '';
    else if (control.kind === 'pause') pauseBeforeMs = Math.min(2000, pauseBeforeMs + control.ms);
    else if (control.kind === 'rate') rateOffset = control.offset;
    else if (control.kind === 'pitch') pitchOffset = control.offset;
    else { style = null; rateOffset = 0; pitchOffset = 0; }
    position = match.index + match[0].length;
    hasTags = true;
  }
  const content = text.slice(position);
  emit(content);
  return { text: segments.map(segment => segment.text).join(''), segments, hasTags };
}

export function stripSpeechTags(text: string): string {
  return parseSpeechTags(text).text;
}

export function speechTagStyle(label: string): string | undefined {
  return Object.hasOwn(EMOTION_STYLES, label) ? EMOTION_STYLES[label] : undefined;
}
