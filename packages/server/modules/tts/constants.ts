const DEFAULT_SAMPLE_TEXT = '你好，我是本局玩家的试听声音。';
const DEFAULT_AZURE_TTS_TIMEOUT_MS = 15000;
const DEFAULT_MIMO_TTS_TIMEOUT_MS = 20000;
const DEFAULT_MIMO_BASE_URL = 'https://api.xiaomimimo.com/v1';
const DEFAULT_MIMO_TTS_MODEL = 'mimo-v2.5-tts';

function getAzureTtsTimeoutMs(): number {
  const value = Number(process.env.AZURE_TTS_TIMEOUT_MS);
  if (Number.isFinite(value) && value > 0) return value;
  return DEFAULT_AZURE_TTS_TIMEOUT_MS;
}

function getMimoTtsTimeoutMs(): number {
  const value = Number(process.env.MIMO_TTS_TIMEOUT_MS);
  if (Number.isFinite(value) && value > 0) return value;
  return DEFAULT_MIMO_TTS_TIMEOUT_MS;
}

export {
  DEFAULT_SAMPLE_TEXT,
  DEFAULT_AZURE_TTS_TIMEOUT_MS,
  DEFAULT_MIMO_TTS_TIMEOUT_MS,
  DEFAULT_MIMO_BASE_URL,
  DEFAULT_MIMO_TTS_MODEL,
  getAzureTtsTimeoutMs,
  getMimoTtsTimeoutMs
};
