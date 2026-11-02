import type { CompiledGame } from '@battle/engine';
import type { AppConfig } from './config/env';
import type { Db } from './db/database';
import { createAiTaskRepository, createAiWorker, createTaskExecutor } from './modules/ai-worker';
import { createAuthRepository, createAuthService } from './modules/auth';
import { createGameService } from './modules/games';
import { createOpenAiCompatibleClient, type LlmClient } from './modules/llm';
import { createCreationLimiter, createMatchReaper, createMatchRepository, createMatchRuntime, createMatchService } from './modules/matches';
import { createModelRepository, createModelService } from './modules/models';
import { createPlayerRepository, createPlayerService } from './modules/players';
import { createProviderRepository, createProviderService } from './modules/providers';
import { createAudioResolver } from './modules/realtime';
import { createMediaRepository, createTtsService, ttsProvidersFromConfig, type TtsProviders } from './modules/tts';
import { createVoiceRepository, createVoiceService } from './modules/voices';
import { createEventBus } from './utils/eventBus';

/** 可替换的外部依赖（测试中注入假的模型与语音） */
export interface ExternalDeps {
  readonly llm?: LlmClient;
  readonly ttsProviders?: TtsProviders;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** 组合根：创建 repository 与 service 并注入依赖 */
export function createServices(db: Db, config: AppConfig, registry: ReadonlyMap<string, CompiledGame>, external: ExternalDeps = {}) {
  const bus = createEventBus();
  const games = createGameService(registry);
  const repositories = {
    auth: createAuthRepository(db),
    providers: createProviderRepository(db),
    models: createModelRepository(db),
    voices: createVoiceRepository(db),
    players: createPlayerRepository(db),
    matches: createMatchRepository(db),
    aiTasks: createAiTaskRepository(db),
    media: createMediaRepository(db),
  };
  const llm = external.llm ?? createOpenAiCompatibleClient();
  const providers = createProviderService(repositories.providers, config.secretKey, repositories.models.countByProvider);
  const models = createModelService({ repository: repositories.models, providers: repositories.providers, credentials: providers.credentials, llm });
  const runtime = createMatchRuntime(repositories.matches, games.find, bus);
  const tts = createTtsService(external.ttsProviders ?? ttsProvidersFromConfig(config.tts), repositories.media);
  const executor = createTaskExecutor({
    tasks: repositories.aiTasks,
    matches: repositories.matches,
    providers,
    models,
    llm,
    findGame: games.find,
    sleep: external.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  });
  return {
    bus,
    repositories,
    games,
    runtime,
    tts,
    auth: createAuthService(repositories.auth, config),
    providers,
    models,
    voices: createVoiceService(repositories.voices, tts),
    players: createPlayerService(repositories.players, repositories.models, repositories.voices),
    matches: createMatchService({
      repository: repositories.matches,
      players: repositories.players,
      runtime,
      findGame: games.find,
      tryGame: (key) => registry.get(key) ?? null,
      limiter: createCreationLimiter(),
      maxActive: config.matches.maxActive,
      idleMs: config.matches.idleMs,
    }),
    reaper: createMatchReaper({ repository: repositories.matches, bus }, { idleMs: config.matches.idleMs }),
    audio: createAudioResolver(db, tts),
    worker: createAiWorker({ tasks: repositories.aiTasks, executor, runtime, bus }, { concurrency: config.ai.concurrency }),
  };
}

export type Services = ReturnType<typeof createServices>;
