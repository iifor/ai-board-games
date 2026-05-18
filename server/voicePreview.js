const DEFAULT_SAMPLE_TEXT = '你好，我是本局玩家的试听声音。';

async function synthesizeVoicePreview(voicePackage, text) {
  if (!voicePackage) throw createVoiceError('语音包不存在', 404);
  const provider = String(voicePackage.provider || 'browser').trim().toLowerCase();
  const content = String(text || voicePackage.sampleText || DEFAULT_SAMPLE_TEXT).trim() || DEFAULT_SAMPLE_TEXT;

  if (provider === 'azure') return synthesizeAzureVoice(voicePackage, content);
  throw createVoiceError('该语音包使用浏览器本地语音，请在前端直接试听。', 422);
}

async function synthesizeAzureVoice(voicePackage, text) {
  const key = getAzureSpeechKey();
  const endpoint = normalizeEndpoint(process.env.AZURE_SPEECH_ENDPOINT);
  const region = process.env.AZURE_SPEECH_REGION || parseRegionFromEndpoint(endpoint);
  if (!key || !region) {
    throw createVoiceError('缺少 AZURE_SPEECH_KEY 或 AZURE_SPEECH_REGION/AZURE_SPEECH_ENDPOINT，无法合成 Azure 语音。', 503);
  }

  const tokenEndpoint = endpoint
    ? `${endpoint}/sts/v1.0/issuetoken`
    : `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`;
  const tokenResponse = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Length': '0'
    }
  });
  if (!tokenResponse.ok) {
    throw createVoiceError(`Azure 语音鉴权失败：${tokenResponse.status} ${await tokenResponse.text()}`, 502);
  }
  const token = await tokenResponse.text();

  const synthesisEndpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const ssml = buildAzureSsml(voicePackage, text);
  const synthesisResponse = await fetch(synthesisEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'consensus-ai-game'
    },
    body: ssml
  });
  if (!synthesisResponse.ok) {
    throw createVoiceError(`Azure 语音合成失败：${synthesisResponse.status} ${await synthesisResponse.text()}`, 502);
  }
  return {
    buffer: Buffer.from(await synthesisResponse.arrayBuffer()),
    mimeType: 'audio/mpeg'
  };
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

function normalizeEndpoint(value) {
  const endpoint = String(value || '').trim().replace(/\/+$/, '');
  return endpoint || '';
}

function parseRegionFromEndpoint(endpoint) {
  const match = String(endpoint || '').match(/^https?:\/\/([^.]+)\./i);
  return match?.[1] || '';
}

function createVoiceError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = {
  synthesizeVoicePreview
};
