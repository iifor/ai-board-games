interface VoicePackage {
  enabled?: boolean;
  provider?: string;
  voiceId?: string;
  language?: string;
  style?: string;
  rate?: string;
  pitch?: string;
  sampleText?: string;
}

interface WordBoundary {
  offset: number;
  duration: number;
  text: string;
}

function isAzureVoice(voice: VoicePackage | null | undefined): boolean {
  return Boolean(voice?.enabled) && String(voice?.provider || '').toLowerCase() === 'azure';
}

function buildAudioCacheKey(voice: VoicePackage, text: string): string {
  return JSON.stringify({
    provider: voice.provider,
    voiceId: voice.voiceId,
    language: voice.language,
    style: voice.style,
    rate: voice.rate,
    pitch: voice.pitch,
    text: String(text || '').trim()
  });
}

function escapeXml(value: string | undefined | null): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeEndpoint(value: string | undefined | null): string {
  const endpoint = String(value || '').trim().replace(/\/+$/, '');
  return endpoint || '';
}

function parseRegionFromEndpoint(endpoint: string | undefined | null): string {
  const match = String(endpoint || '').match(/^https?:\/\/([^.]+)\./i);
  return match?.[1] || '';
}

function getAzureSpeechKey(): string {
  return process.env.AZURE_SPEECH_KEY
    || process.env.SPEECH_KEY
    || process.env.AZURE_COGNITIVE_SERVICES_KEY
    || '';
}

function buildAzureSsml(voicePackage: VoicePackage, text: string): string {
  const language = escapeXml(voicePackage.language || 'zh-CN');
  const voiceId = escapeXml(voicePackage.voiceId || 'zh-CN-XiaoxiaoNeural');
  const style = String(voicePackage.style || '').trim();
  const rate = escapeXml(voicePackage.rate || '0%');
  const pitch = escapeXml(voicePackage.pitch || '0%');
  const escapedText = escapeXml(text);
  const prosody = `<prosody rate="${rate}" pitch="${pitch}">${escapedText}</prosody>`;
  const inner = style
    ? `<mstts:express-as style="${escapeXml(style)}">${prosody}</mstts:express-as>`
    : prosody;

  return [
    `<speak version="1.0" xml:lang="${language}" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts">`,
    `<voice name="${voiceId}">${inner}</voice>`,
    '</speak>'
  ].join('');
}

export type { VoicePackage, WordBoundary };
export {
  isAzureVoice,
  buildAudioCacheKey,
  escapeXml,
  normalizeEndpoint,
  parseRegionFromEndpoint,
  getAzureSpeechKey,
  buildAzureSsml
};
