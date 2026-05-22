function isAzureVoice(voice) {
  return Boolean(voice?.enabled) && String(voice.provider || '').toLowerCase() === 'azure';
}

function buildAudioCacheKey(voice, text) {
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

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeEndpoint(value) {
  const endpoint = String(value || '').trim().replace(/\/+$/, '');
  return endpoint || '';
}

function parseRegionFromEndpoint(endpoint) {
  const match = String(endpoint || '').match(/^https?:\/\/([^.]+)\./i);
  return match?.[1] || '';
}

function getAzureSpeechKey() {
  return process.env.AZURE_SPEECH_KEY
    || process.env.SPEECH_KEY
    || process.env.AZURE_COGNITIVE_SERVICES_KEY
    || '';
}

function buildAzureSsml(voicePackage, text) {
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

module.exports = {
  isAzureVoice,
  buildAudioCacheKey,
  escapeXml,
  normalizeEndpoint,
  parseRegionFromEndpoint,
  getAzureSpeechKey,
  buildAzureSsml
};
