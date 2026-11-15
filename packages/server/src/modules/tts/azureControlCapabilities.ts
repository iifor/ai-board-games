import type { VoiceControlSupport } from '@battle/shared';

/** eastasia 实测于 2026-11-14，141 段 PCM 对照；详见 docs/operations/azure-controls-20261114.md。 */
const MEASURED: Readonly<Record<string, VoiceControlSupport>> = {
  'zh-CN-XiaoxiaoNeural': { pause: true, rate: true, pitch: true },
  'zh-CN-YunzeNeural': { pause: true, rate: true, pitch: true },
  'zh-CN-YunyangNeural': { pause: true, rate: true, pitch: true },
  'zh-CN-YunfengNeural': { pause: true, rate: true, pitch: true },
  'zh-CN-XiaochenMultilingualNeural': { pause: true, rate: true, pitch: true },
  'zh-CN-XiaoyanNeural': { pause: true, rate: true, pitch: true },
  'zh-CN-YunxiNeural': { pause: true, rate: true, pitch: true },
  'zh-CN-XiaomengNeural': { pause: true, rate: true, pitch: true },
  'zh-CN-Yunxi:DragonHDFlashLatestNeural': { pause: true, rate: true, pitch: false },
  'zh-CN-Yunhan:DragonHDFlashLatestNeural': { pause: true, rate: true, pitch: false },
  'zh-CN-Xiaoxiao2:DragonHDFlashLatestNeural': { pause: true, rate: true, pitch: false },
  'zh-CN-Xiaoxiao:DragonHDFlashLatestNeural': { pause: true, rate: true, pitch: false },
  'zh-CN-Yunyi:DragonHDFlashLatestNeural': { pause: true, rate: true, pitch: false },
};

const UNMEASURED: VoiceControlSupport = { pause: false, rate: false, pitch: false };

export function azureControlSupport(voiceName: string, region: string): VoiceControlSupport {
  if (region.toLowerCase() !== 'eastasia') return UNMEASURED;
  const key = Object.keys(MEASURED).find(name => name.toLowerCase() === voiceName.toLowerCase());
  return key ? MEASURED[key] ?? UNMEASURED : UNMEASURED;
}
