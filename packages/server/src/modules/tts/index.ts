import type { AppConfig } from '../../config/env';
import { createAzureTts } from './azure';
import { createMimoTts } from './mimo';
import type { TtsProviders } from './types';

export { createMediaRepository } from './repository';
export { mediaRoutes } from './routes';
export { assetId, createTtsService, type TtsService, type VoiceChoice } from './service';
export type { TtsProvider, TtsProviders, VoiceSpec } from './types';

export function ttsProvidersFromConfig(config: AppConfig['tts']): TtsProviders {
  return {
    ...(config.azure ? { azure: createAzureTts(config.azure) } : {}),
    ...(config.mimo ? { mimo: createMimoTts(config.mimo) } : {}),
  };
}
