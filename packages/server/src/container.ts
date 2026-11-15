import { randomUUID } from 'node:crypto';
import { memoryWorker } from './modules/player-memory/worker';
import { memoryReader } from './modules/player-memory/readRepository';
import { memoryEraser } from './modules/player-memory/forgetRepository';
import { reviewRepository } from './modules/player-memory/reviewRepository';
import { announcementRepository } from './modules/announcements/repository';
import { announcementService } from './modules/announcements/service';
import { perspectiveRepository } from './modules/perspectives/repository';
import { perspectiveService } from './modules/perspectives/service';
import type { CompiledGame } from '@battle/engine';
import type { AppConfig } from './config/env';
import type { Db } from './db/database';
import { createTraceRepository } from './modules/traces/repository';
import { createTraceService } from './modules/traces/service';
import { comparisonRepository } from './modules/traces/comparisonRepository';
import { comparisonService } from './modules/traces/comparisonService';
import { catalogRepository } from './modules/prompt-catalog/repository';
import { catalogService } from './modules/prompt-catalog/service';
import { debateTopicAnnouncement } from './modules/announcements/debateTopic';
import { createPgNotifier, type BusTransport } from './db/notifier';
import { createAiTaskRepository, createAiWorker, createTaskExecutor } from './modules/ai-worker';
import { createAuthRepository, createAuthService, FAILED_LOGIN_WINDOW_MS } from './modules/auth';
import { createGameService } from './modules/games';
import { createHealthRepository, createHealthService } from './modules/health';
import { createDbWindowStore, createRequestWindowRepository } from './modules/limits';
import { createOpenAiCompatibleClient, type LlmClient } from './modules/llm';
import {
  createCreationLimiter, createMatchReaper, createMatchRepository, createMatchRuntime, createMatchService, CREATION_WINDOW_MS,
} from './modules/matches';
import { createModelRepository, createModelService } from './modules/models';
import { createPlayerRepository, createPlayerService } from './modules/players';
import { createProviderRepository, createProviderService } from './modules/providers';
import { createAudioResolver, createRealtimeService } from './modules/realtime';
import { createMediaRepository, createTtsService, ttsProvidersFromConfig, type TtsProviders } from './modules/tts';
import { createVoiceRepository, createVoiceService } from './modules/voices';
import { createAzureVoiceCatalog } from './modules/voices/azureCatalog';
import { createSpeechDelivery } from './modules/ai-worker/speechDelivery';
import type { AzureVoiceCatalogEntry } from '@battle/shared';
import { replayRepository } from './modules/replay-imports/repository';
import { replayService } from './modules/replay-imports/service';
import { createPgEventBus } from './utils/pgEventBus';

/** 可替换的外部依赖（测试中注入假的模型、语音或通知传输层） */
export interface ExternalDeps {
  readonly llm?: LlmClient;
  readonly ttsProviders?: TtsProviders;
  readonly azureVoiceCatalog?: () => Promise<AzureVoiceCatalogEntry[]>;
  readonly sleep?: (ms: number) => Promise<void>;
  /** 跨实例通知的传输层；省略时用 PostgreSQL LISTEN/NOTIFY */
  readonly busTransport?: BusTransport;
}

/** 组合根：创建 repository 与 service 并注入依赖。每次调用就是一个实例（独立的实例 ID 与总线） */
export function createServices(db: Db, config: AppConfig, registry: ReadonlyMap<string, CompiledGame>, external: ExternalDeps = {}) {
  const instanceId = randomUUID();
  const bus = createPgEventBus({
    instanceId,
    transport: external.busTransport ?? createPgNotifier({ db, schema: config.database.schema, connectionString: config.database.url }),
  });
  const games = createGameService(registry);
  const catalog = catalogRepository(db);
  const debate = registry.get('debate');
  const announcements = announcementService(announcementRepository(db), debate && debateTopicAnnouncement(debate, catalog));
  const repositories = {
    auth: createAuthRepository(db),
    providers: createProviderRepository(db),
    models: createModelRepository(db),
    voices: createVoiceRepository(db),
    players: createPlayerRepository(db),
    matches: createMatchRepository(db),
    aiTasks: createAiTaskRepository(db),
    media: createMediaRepository(db),
    requestWindows: createRequestWindowRepository(db),
    health: createHealthRepository(db),
  };
  // 开局限流与登录锁定共用一张表，保留期取两者里最长的窗口
  const windows = createDbWindowStore(repositories.requestWindows, { retentionMs: Math.max(CREATION_WINDOW_MS, FAILED_LOGIN_WINDOW_MS) });
  const llm = external.llm ?? createOpenAiCompatibleClient();
  const providers = createProviderService(repositories.providers, config.secretKey, repositories.models.countByProvider);
  const toolPrompt = async (key: string, fallback: string) => (await catalog.get('system', key))?.source ?? fallback;
  const models = createModelService({ repository: repositories.models, providers: repositories.providers, credentials: providers.credentials, llm, toolPrompt });
  const runtime = createMatchRuntime(repositories.matches, games.find, bus);
  const azureVoiceCatalog = external.azureVoiceCatalog ?? createAzureVoiceCatalog(config.tts.azure);
  const tts = createTtsService(external.ttsProviders ?? ttsProvidersFromConfig(config.tts, azureVoiceCatalog), repositories.media);
  const audio = createAudioResolver({ voices: repositories.voices, matches: repositories.matches, tts });
  const executor = createTaskExecutor({
    tasks: repositories.aiTasks,
    matches: repositories.matches,
    providers,
    models,
    llm,
    findGame: games.find,
    sleep: external.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    speechDelivery: createSpeechDelivery({ matches: repositories.matches, catalog: azureVoiceCatalog, region: config.tts.azure?.region ?? '' }),
  });
  const matches = createMatchService({
    repository: repositories.matches,
    players: repositories.players,
    runtime,
    findGame: games.find,
    tryGame: (key) => registry.get(key) ?? null,
    limiter: createCreationLimiter(windows),
    maxActive: config.matches.maxActive,
    idleMs: config.matches.idleMs,
    // 生产环境里调试局不对外；开发与测试用 C 端舞台验收脚本化调试局
    debugVisibleToPublic: config.env !== 'production',
  });
  return {
    instanceId,
    playerMemory: { ...memoryReader(db), forget: memoryEraser(db) },
    memoryWorker: memoryWorker(reviewRepository(db), { matches: repositories.matches, tasks: repositories.aiTasks, llm, providers }),
    announcements,
    perspectives: perspectiveService(perspectiveRepository(db)),
    replayImports: replayService({ repository:replayRepository(db,repositories.matches), players:repositories.players, models, providers, llm, toolPrompt }),
    localDebugEnabled: config.env === 'development',
    traces: createTraceService(createTraceRepository(db), key => registry.get(key)?.spec.roles),
    promptComparisons: comparisonService({ repository: comparisonRepository(db), llm, models, providers }),
    promptCatalog: catalogService(registry, catalog, { llm, models, providers }),
    bus,
    repositories,
    games,
    runtime,
    tts,
    auth: createAuthService(repositories.auth, config, windows),
    providers,
    models,
    voices: createVoiceService(repositories.voices, tts, azureVoiceCatalog),
    players: createPlayerService(repositories.players, repositories.models, repositories.voices),
    matches,
    reaper: createMatchReaper({ repository: repositories.matches, bus }, { idleMs: config.matches.idleMs }),
    audio,
    // 播放流是公开接口：对局的可见性与 C 端概要接口同一口径
    realtime: createRealtimeService({
      matches: { find: matches.findPublic, nextEvent: repositories.matches.nextEvent, markAcked: repositories.matches.markAcked },
      bus,
      audio,
    }, { pollMs: config.realtime.pollMs }),
    health: createHealthService(repositories.health, { instanceId }),
    worker: createAiWorker({ tasks: repositories.aiTasks, executor, runtime, bus }, {
      concurrency: config.ai.concurrency,
      maxAttempts: config.ai.maxAttempts,
      stopTimeoutMs: config.shutdown.timeoutMs,
    }),
  };
}

export type Services = ReturnType<typeof createServices>;
