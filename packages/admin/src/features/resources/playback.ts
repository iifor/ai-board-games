import type { VoiceDto } from '@battle/shared';

let current: HTMLAudioElement | null = null;

/** 播放服务端合成的音频；开始新的试听前停掉上一段 */
export async function playAudio(url: string): Promise<void> {
  current?.pause();
  const audio = new Audio(url);
  current = audio;
  await audio.play();
}

/** 浏览器本地朗读：优先按音色名匹配本地语音，否则按语言 */
export function speakInBrowser(voice: Pick<VoiceDto, 'voiceName' | 'language'>, text: string): void {
  if (!('speechSynthesis' in window)) throw new Error('当前浏览器不支持本地朗读');
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice.language || 'zh-CN';
  const voices = synth.getVoices();
  const matched = voices.find((item) => item.voiceURI === voice.voiceName || item.name === voice.voiceName)
    ?? voices.find((item) => item.lang === utterance.lang)
    ?? voices.find((item) => /^zh/i.test(item.lang));
  if (matched) utterance.voice = matched;
  synth.speak(utterance);
}
