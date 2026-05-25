import { WebSocketServer, WebSocket } from 'ws';
import { getDb } from '../../db';
import { createSession, isSessionCancelled, parseMessage } from './session';
import { createPreparedSender } from './sender';
import { replayGameSession } from './replay';
import type { GameSession } from './session';

// config is still JS — use require for now
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getAiConfig } = require('../../config');

// aiDebateRunner is still JS — use require for now
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runAiDebate } = require('../../aiDebateRunner');

// werewolf is still JS — use require for now
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runWerewolfWorkflow } = require('../werewolf');

// werewolf-config/service is TS but loaded via require to match existing pattern
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getWerewolfModeConfig } = require('../werewolf-config');

// werewolf/views/viewPolicy is still JS — use require for now
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createProjectionContext, projectWerewolfGame } = require('../werewolf/views/viewPolicy');

// games is TS — import directly
import { saveGameRecord } from '../games';
import type { SaveGameInput } from '../games';

// --- Interfaces ---

interface AiConfigHost {
  id?: number;
  name?: string;
  nickname?: string;
  provider?: string;
  providerName?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  apiKey?: string;
  apiFormat?: string;
  model?: string;
  modelId?: number | null;
  temperature?: number;
  personality?: string;
  sex?: string;
  avatar?: string;
  avatarUrl?: string;
  voicePackageId?: number | string | null;
  defaultHostPlayerId?: number | null;
  [key: string]: unknown;
}

interface AiConfigPlayer {
  id?: number;
  name?: string;
  nickname?: string;
  provider?: string;
  providerName?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  apiKey?: string;
  apiFormat?: string;
  model?: string;
  modelId?: number | null;
  temperature?: number;
  personality?: string;
  sex?: string;
  avatar?: string;
  avatarUrl?: string;
  voicePackageId?: number | string | null;
  [key: string]: unknown;
}

interface MissingProvider {
  provider: string;
  apiKeyEnv: string;
  [key: string]: unknown;
}

interface AiConfig {
  rounds?: number;
  host: AiConfigHost;
  players: AiConfigPlayer[];
  missingProviders: MissingProvider[];
  realReady?: boolean;
  [key: string]: unknown;
}

interface DebateTeams {
  proIds?: (number | string)[];
  conIds?: (number | string)[];
  judgeIds?: (number | string)[];
  [key: string]: unknown;
}

interface SessionMessage {
  type?: string;
  mode?: string;
  playerIds?: (number | string)[];
  gameType?: string;
  topic?: Record<string, unknown>;
  debateTeams?: DebateTeams;
  hostId?: number | string;
  werewolfMode?: string | Record<string, unknown>;
  replayGameId?: string;
  clientViewMode?: string;
  replayView?: Record<string, unknown>;
  ackId?: number;
  action?: string;
  [key: string]: unknown;
}

interface RunSessionOptions {
  topic?: Record<string, unknown>;
  debateTeams?: DebateTeams;
  hostId?: number | string;
  werewolfMode?: string | Record<string, unknown>;
  replayGameId?: string;
  clientViewMode?: string;
  replayView?: Record<string, unknown>;
}

interface PlayerSelectionRow {
  playerIdsJson: string;
}

interface GameRecord {
  id?: string;
  gameType?: string;
  type?: string;
  [key: string]: unknown;
}

// --- Socket attachment ---

function attachGameSocket(server: import('http').Server): void {
  const wss = new WebSocketServer({ server, path: '/api/toc/ws/game' });

  wss.on('connection', (socket: WebSocket) => {
    const session = createSession(socket);

    socket.on('message', async (raw: Buffer | string) => {
      const message = parseMessage(raw) as SessionMessage | null;
      if (!message) return;

      if (message.type === 'start') {
        runSession(
          session,
          message.mode || 'real',
          message.playerIds,
          message.gameType,
          {
            topic: message.topic,
            debateTeams: message.debateTeams,
            hostId: message.hostId,
            werewolfMode: message.werewolfMode,
            replayGameId: message.replayGameId,
            clientViewMode: message.clientViewMode,
            replayView: message.replayView,
          },
        ).catch((error: unknown) => {
          if (isSessionCancelled(error)) return;
          console.error(error);
          session.send({ type: 'error', message: (error as Error).message });
        });
      }

      if (message.type === 'ack') {
        session.resolveAck(message.ackId!);
      }

      if (message.type === 'control') {
        session.setPaused(message.action === 'pause');
        if (message.action === 'skip-phase') session.skipCurrentPhase();
      }
    });
  });
}

// --- Session runner ---

async function runSession(
  session: GameSession,
  mode: string,
  playerIds?: (number | string)[],
  gameType = 'werewolf',
  options: RunSessionOptions = {},
): Promise<void> {
  const safeGameType = normalizeGameType(gameType);
  if (mode !== 'real') throw new Error('全局已禁用 Mock 模式，只支持真实模式。');
  if (options.replayGameId) {
    await replayGameSession(session, safeGameType, options.replayGameId, { replayView: options.replayView });
    return;
  }
  const config = getRequestConfig(mode, playerIds, safeGameType, options);

  const sender = createPreparedSender(
    session,
    safeGameType === 'debate' ? { phaseLookahead: 1 } : { prefetchCount: 2 },
  );

  if (safeGameType !== 'debate') {
    await sender.send({
      type: 'host',
      message: getStartMessage(safeGameType),
      game: { type: safeGameType, host: publicSocketHost(config.host) },
    });
  }

  const runner = getRunner(safeGameType);
  const game = (await runner(config, {
    onEvent: (event: Record<string, unknown>) => sender.enqueue(event),
  })) as GameRecord;
  await sender.flush();

  saveGameRecord({ ...game, audioResources: sender.getAudioResources() } as unknown as SaveGameInput);

  await sender.send({
    type:
      safeGameType === 'debate' || safeGameType === 'werewolf'
        ? 'workflow-completed'
        : 'done',
    message: getDoneMessage(safeGameType),
    game:
      safeGameType === 'werewolf'
        ? projectWerewolfGame(game, createProjectionContext(game))
        : game,
  });
  session.close();
}

// --- Helpers ---

function normalizeGameType(gameType?: string): string {
  if (gameType === 'debate') return 'debate';
  if (gameType === 'werewolf') return 'werewolf';
  return 'werewolf';
}

function getRunner(gameType: string): (config: unknown, options: unknown) => Promise<unknown> {
  if (gameType === 'debate') return runAiDebate;
  return runWerewolfWorkflow;
}

function getStartMessage(gameType: string): string {
  if (gameType === 'debate') return '辩论赛开始';
  return '游戏开始';
}

function getDoneMessage(gameType: string): string {
  if (gameType === 'debate') return '辩论赛结束，完整赛果已生成。';
  return '狼人杀结束，完整战报已生成。';
}

function getRequestConfig(
  mode: string,
  playerIds: (number | string)[] | undefined,
  gameType = 'werewolf',
  options: RunSessionOptions = {},
): AiConfig & { mode: string } {
  const config = getAiConfig() as AiConfig;
  const selected =
    gameType === 'debate' && hasDebateTeamConfig(options.debateTeams)
      ? selectDebateTeamPlayers(config, options.debateTeams!)
      : selectPlayersForGame(config, playerIds, gameType, options);
  const host = resolveRequestHost(config, options.hostId);
  const selectedProviders = new Set([
    host.provider,
    ...selected.map((player: AiConfigPlayer) => player.provider),
  ]);
  const missingProviders = config.missingProviders.filter(
    (item) => selectedProviders.has(item.provider),
  );
  const scopedConfig: AiConfig & {
    selectedPlayerIds: number[];
    gameType: string;
    topic: Record<string, unknown> | null;
    debateTeams: DebateTeams | null;
    werewolfMode: string | Record<string, unknown> | null;
    clientViewMode: string;
    realReady: boolean;
  } = {
    ...config,
    host,
    players: selected,
    selectedPlayerIds: selected.map((player: AiConfigPlayer) => player.id!),
    gameType,
    topic: options.topic || null,
    debateTeams: options.debateTeams || null,
    werewolfMode: options.werewolfMode || null,
    clientViewMode: options.clientViewMode || 'god',
    missingProviders,
    realReady: missingProviders.length === 0,
  };
  if (mode !== 'real') throw new Error('全局已禁用 Mock 模式，只支持真实模式。');
  if (scopedConfig.missingProviders.length) {
    const missing = scopedConfig.missingProviders
      .map((item) => `${item.provider}(${item.apiKeyEnv})`)
      .join('、');
    throw new Error(
      `真实模式缺少 API Key：${missing}。请在 .env 或 B 端模型管理中配置。`,
    );
  }
  return { ...scopedConfig, mode: 'real' };
}

function resolveRequestHost(
  config: AiConfig,
  hostId?: number | string,
): AiConfigHost {
  const id = Number(hostId);
  if (!id) return config.host;
  const player = config.players.find((item) => Number(item.id) === id);
  if (!player) return config.host;
  return {
    ...config.host,
    id: player.id,
    name: player.name || player.nickname || config.host.name,
    nickname: player.nickname || player.name || config.host.nickname,
    provider: player.provider,
    providerName: player.providerName || player.provider,
    baseUrl: player.baseUrl,
    apiKeyEnv: player.apiKeyEnv,
    apiKey: player.apiKey,
    apiFormat: player.apiFormat,
    model: player.model,
    modelId: player.modelId,
    temperature: Number(
      player.temperature ?? config.host.temperature ?? 0.35,
    ),
    personality: player.personality || '',
    sex: player.sex || '',
    avatar: player.avatar || '',
    avatarUrl: player.avatarUrl || player.avatar || '',
    voicePackageId: player.voicePackageId || null,
  };
}

function publicSocketHost(host: AiConfigHost = {}): Record<string, unknown> {
  return {
    id: host.id || 0,
    name: host.name || host.nickname || '主持人',
    nickname: host.nickname || host.name || '主持人',
    avatar: host.avatar || '',
    avatarUrl: host.avatarUrl || host.avatar || '',
    voicePackageId: host.voicePackageId || null,
  };
}

function hasDebateTeamConfig(value?: DebateTeams | null): boolean {
  return Boolean(
    value && Array.isArray(value.proIds) && Array.isArray(value.conIds),
  );
}

function selectDebateTeamPlayers(
  config: AiConfig,
  debateTeams: DebateTeams,
): AiConfigPlayer[] {
  const ids = normalizeDebateTeamPlayerIds(debateTeams);
  const selected = ids
    .map((id) =>
      config.players.find((player) => Number(player.id) === Number(id)),
    )
    .filter((p): p is AiConfigPlayer => Boolean(p));
  if (selected.length < 8 || selected.length > 12) {
    throw new Error('AI 辩论赛玩家配置无效：正方、反方和评委人数不正确。');
  }
  return selected;
}

function normalizeDebateTeamPlayerIds(debateTeams: DebateTeams): number[] {
  const ids = [
    ...normalizeIdList(debateTeams.proIds).slice(0, 4),
    ...normalizeIdList(debateTeams.conIds).slice(0, 4),
    ...normalizeIdList(debateTeams.judgeIds),
  ];
  return [...new Set(ids)];
}

function normalizeIdList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter(Boolean);
}

function selectPlayersForGame(
  config: AiConfig,
  playerIds: (number | string)[] | undefined,
  gameType: string,
  options: RunSessionOptions = {},
): AiConfigPlayer[] {
  const explicitIds = Array.isArray(playerIds)
    ? playerIds.map(Number).filter(Boolean)
    : [];
  const ids = explicitIds.length ? explicitIds : getSavedPlayerIds(gameType);
  const expectedWerewolfCount =
    gameType === 'werewolf'
      ? getWerewolfModeConfig(options.werewolfMode).totalPlayers
      : 12;

  const selected = ids.length
    ? ids
        .map((id) =>
          config.players.find((player) => Number(player.id) === id),
        )
        .filter((p): p is AiConfigPlayer => Boolean(p))
    : config.players.slice(0, gameType === 'debate' ? 12 : expectedWerewolfCount);

  if (gameType === 'debate') {
    if (selected.length < 8 || selected.length > 12) {
      throw new Error('AI 辩论赛需要选择 8-12 位 AI 玩家。');
    }
    return selected;
  }

  if (gameType === 'werewolf') {
    if (selected.length !== expectedWerewolfCount) {
      throw new Error(
        `AI 狼人杀当前模式需要选择恰好 ${expectedWerewolfCount} 位 AI 玩家。`,
      );
    }
    return selected;
  }

  return selected;
}

function getSavedPlayerIds(gameType: string): number[] {
  try {
    const row = getDb()
      .prepare(
        'SELECT player_ids_json AS playerIdsJson FROM game_player_selections WHERE game_type = ?',
      )
      .get(gameType) as PlayerSelectionRow | undefined;
    if (!row) return [];
    const parsed: unknown = JSON.parse(row.playerIdsJson);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export {
  attachGameSocket,
  runSession,
  normalizeGameType,
  getRunner,
  getRequestConfig,
  resolveRequestHost,
  publicSocketHost,
  selectPlayersForGame,
  getSavedPlayerIds,
};
