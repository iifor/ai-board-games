import type { AppConfig } from '../../config/env';
import { createAzureTts } from './azure';
import { createMimoTts } from './mimo';
import type { TtsProviders } from './types';
import type { AzureVoiceCatalogEntry } from '@battle/shared';

export { createMediaRepository, type LockedAsset, type MediaRepository, type NewMediaAsset } from './repository';
export { mediaRoutes } from './routes';
export { assetId, createTtsService, type TtsService, type TtsServiceOptions, type VoiceChoice } from './service';
export type { TtsProvider, TtsProviders, VoiceSpec } from './types';

export function ttsProvidersFromConfig(config: AppConfig['tts'], azureCatalog?: () => Promise<AzureVoiceCatalogEntry[]>): TtsProviders {
  return {
    ...(config.azure ? { azure: createAzureTts(config.azure, azureCatalog) } : {}),
    ...(config.mimo ? { mimo: createMimoTts(config.mimo) } : {}),
  };
}
