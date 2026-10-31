import type { CompiledGame } from '@battle/engine';
import type { AppConfig } from './config/env';
import type { Db } from './db/database';
import { createAuthRepository, createAuthService } from './modules/auth';
import { createGameService } from './modules/games';
import { createModelRepository, createModelService } from './modules/models';
import { createPlayerRepository, createPlayerService } from './modules/players';
import { createProviderRepository, createProviderService } from './modules/providers';
import { createVoiceRepository, createVoiceService } from './modules/voices';

/** 组合根：创建 repository 与 service 并注入依赖 */
export function createServices(db: Db, config: AppConfig, registry: ReadonlyMap<string, CompiledGame>) {
  const repositories = {
    auth: createAuthRepository(db),
    providers: createProviderRepository(db),
    models: createModelRepository(db),
    voices: createVoiceRepository(db),
    players: createPlayerRepository(db),
  };
  return {
    repositories,
    auth: createAuthService(repositories.auth, config),
    providers: createProviderService(repositories.providers, config.secretKey),
    models: createModelService(repositories.models, repositories.providers),
    voices: createVoiceService(repositories.voices),
    players: createPlayerService(repositories.players, repositories.models, repositories.voices),
    games: createGameService(registry),
  };
}

export type Services = ReturnType<typeof createServices>;
