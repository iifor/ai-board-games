import { buildAzureSsml } from './azureSsml';
import { prepareAzureSpeech } from './azureSpeech';
import { createAzureVoiceCatalog } from '../voices/azureCatalog';
import { azureControlSupport } from './azureControlCapabilities';
import { createAzureSynthesis, type AzureSynthesizer } from './azureTransport';
import { azureCaptionCues } from './azureCaptions';
import type { AzureVoiceCatalogEntry } from '@battle/shared';
import type { SynthesizedAudio, TtsProvider, VoiceSpec } from './types';

/** 请求的输出格式；决定音频内容，因此参与缓存键 */
const AZURE_OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

/** 官方 SDK 同时生成音频及其字幕时间轴。 */
export function createAzureTts(
  config: { readonly key: string; readonly region: string },
  catalog: () => Promise<AzureVoiceCatalogEntry[]> = createAzureVoiceCatalog(config),
  synthesize: AzureSynthesizer = createAzureSynthesis(config),
): TtsProvider {
  return {
    signature: `azure-sdk:${AZURE_OUTPUT_FORMAT}:captions-v1`,
    prepare: (text, voice) => prepareAzureSpeech(text, voice, catalog, azureControlSupport(voice.voiceName, config.region)),
    async synthesize(text: string, voice: VoiceSpec): Promise<SynthesizedAudio> {
      const speech = voice.controls ? { text, voice } : await prepareAzureSpeech(text, voice, catalog, azureControlSupport(voice.voiceName, config.region));
      const result = await synthesize(buildAzureSsml(speech.voice, speech.text));
      const captions = azureCaptionCues(speech.text, result.words);
      return { data: result.data, mime: result.mime, ...(captions ? { captions } : {}) };
    },
  };
}
