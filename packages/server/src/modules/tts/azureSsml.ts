import type { StyledSpeechSegment, VoiceSpec } from './types';

export function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] ?? char);
}

/** Azure SSML：语言、音色、风格（mstts:express-as，需目标音色支持）、语速与音调（prosody） */
export function buildAzureSsml(voice: VoiceSpec, text: string): string {
  const controls = voice.controls ?? { pause: true, rate: true, pitch: true };
  const segments: readonly StyledSpeechSegment[] = voice.segments ?? [{ text, style: voice.style }];
  const inner = segments.map(segment => {
    const attributes: string[] = [];
    if (controls.rate) attributes.push(`rate="${escapeXml((segment.rate ?? voice.rate) || '0%')}"`);
    if (controls.pitch) attributes.push(`pitch="${escapeXml((segment.pitch ?? voice.pitch) || '0%')}"`);
    let content = escapeXml(segment.text);
    if (content && attributes.length) content = `<prosody ${attributes.join(' ')}>${content}</prosody>`;
    if (content && segment.style) content = `<mstts:express-as style="${escapeXml(segment.style)}">${content}</mstts:express-as>`;
    const pause = controls.pause && segment.pauseBeforeMs ? `<break time="${segment.pauseBeforeMs}ms"/>` : '';
    return pause + content;
  }).join('');
  return [
    `<speak version="1.0" xml:lang="${escapeXml(voice.language || 'zh-CN')}" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts">`,
    `<voice name="${escapeXml(voice.voiceName)}">${inner}</voice>`,
    '</speak>',
  ].join('');
}
