import type { VoiceSpec } from './types';

export function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] ?? char);
}

/** Azure SSML：语言、音色、风格（mstts:express-as，需目标音色支持）、语速与音调（prosody） */
export function buildAzureSsml(voice: VoiceSpec, text: string): string {
  const prosody = `<prosody rate="${escapeXml(voice.rate || '0%')}" pitch="${escapeXml(voice.pitch || '0%')}">${escapeXml(text)}</prosody>`;
  const inner = voice.style ? `<mstts:express-as style="${escapeXml(voice.style)}">${prosody}</mstts:express-as>` : prosody;
  return [
    `<speak version="1.0" xml:lang="${escapeXml(voice.language || 'zh-CN')}" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts">`,
    `<voice name="${escapeXml(voice.voiceName)}">${inner}</voice>`,
    '</speak>',
  ].join('');
}
