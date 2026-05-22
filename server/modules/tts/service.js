const { DEFAULT_SAMPLE_TEXT } = require('./constants');
const {
  getAzureSpeechKey, normalizeEndpoint, parseRegionFromEndpoint,
  buildAzureSsml, escapeXml
} = require('./utils');
const { AppError, ErrorCodes } = require('../../utils/errors');

async function synthesizeVoicePreview(voicePackage, text) {
  if (!voicePackage) throw new AppError(ErrorCodes.NOT_FOUND, '语音包不存在', 404);
  const provider = String(voicePackage.provider || 'browser').trim().toLowerCase();
  const content = String(text || voicePackage.sampleText || DEFAULT_SAMPLE_TEXT).trim() || DEFAULT_SAMPLE_TEXT;

  if (provider === 'azure') return synthesizeAzureVoice(voicePackage, content);
  throw new AppError('UNSUPPORTED_VOICE', '该语音包使用浏览器本地语音，请在前端直接试听。', 422);
}

async function synthesizeAzureVoice(voicePackage, text) {
  const key = getAzureSpeechKey();
  const endpoint = normalizeEndpoint(process.env.AZURE_SPEECH_ENDPOINT);
  const region = process.env.AZURE_SPEECH_REGION || parseRegionFromEndpoint(endpoint);
  if (!key || !region) {
    throw new AppError(ErrorCodes.UPSTREAM_ERROR, '缺少 AZURE_SPEECH_KEY 或 AZURE_SPEECH_REGION/AZURE_SPEECH_ENDPOINT，无法合成 Azure 语音。', 503);
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
    throw new AppError(ErrorCodes.UPSTREAM_ERROR, `Azure 语音鉴权失败：${tokenResponse.status} ${await tokenResponse.text()}`, 502);
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
    throw new AppError(ErrorCodes.UPSTREAM_ERROR, `Azure 语音合成失败：${synthesisResponse.status} ${await synthesisResponse.text()}`, 502);
  }
  return {
    buffer: Buffer.from(await synthesisResponse.arrayBuffer()),
    mimeType: 'audio/mpeg'
  };
}

module.exports = { synthesizeVoicePreview };
