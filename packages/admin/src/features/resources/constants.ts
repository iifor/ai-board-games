import type { VoiceProvider } from '@battle/shared';

export const PROVIDER_LABELS: Readonly<Record<VoiceProvider, string>> = { azure: 'Azure 语音', mimo: 'Mimo', browser: '浏览器朗读' };

/** 音色没有试听文本时，浏览器朗读用的默认文本（服务端合成有自己的默认值） */
export const DEFAULT_SAMPLE_TEXT = '你好，我正在为这局游戏进行语音试听。';
