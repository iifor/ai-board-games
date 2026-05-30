import { WebSocketServer, WebSocket } from 'ws';
import { getDb } from '../../db';
import { createSession, isSessionCancelled, parseMessage } from './session';
import { createPreparedSender } from './sender';
import { replayGameSession } from './replay';
import type { GameSession } from './session';
import { getAiConfig } from '../../config';
import { runAiDebate } from '../../aiDebateRunner';
import { runWerewolfWorkflow } from '../werewolf';
import { getWerewolfModeConfig } from '../werewolf-config';
import { buildWerewolfRuleIntro } from '../werewolf/messages';
import { createProjectionContext, projectWerewolfGame } from '../werewolf/views/viewPolicy';

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
  werewolfMode?: string | Record<string, unknown>;
  replayGameId?: string;
  clientViewMode?: string;
  debugMode?: boolean;
  replayView?: Record<string, unknown>;
  ackId?: number;
  action?: string;
  [key: string]: unknown;
}

interface RunSessionOptions {
  topic?: Record<string, unknown>;
  debateTeams?: DebateTeams;
  werewolfMode?: string | Record<string, unknown>;
  replayGameId?: string;
  clientViewMode?: string;
  debugMode?: boolean;
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

      if (message.type === 'randomize-teams') {
        handleRandomizeTeams(session, message.playerIds);
      }

      if (message.type === 'start') {
        runSession(
          session,
          message.mode || 'real',
          message.playerIds,
          message.gameType,
          {
            topic: message.topic,
            debateTeams: message.debateTeams,
            werewolfMode: message.werewolfMode,
            replayGameId: message.replayGameId,
            clientViewMode: message.clientViewMode,
            debugMode: message.debugMode,
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

  const runner = getRunner(safeGameType);
  const game = (await runner(config, {
    onEvent: (event: Record<string, unknown>) => sender.enqueue(event),
  })) as GameRecord;
  await sender.flush();

  // 调试模式不保存数据库，只保留 AI 观测数据
  if (!(config as Record<string, unknown>).debugMode) {
    saveGameRecord({ ...game, audioResources: sender.getAudioResources() } as unknown as SaveGameInput);
  }

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
  const config = getAiConfig() as unknown as AiConfig;
  const selected =
    gameType === 'debate' && hasDebateTeamConfig(options.debateTeams)
      ? selectDebateTeamPlayers(config, options.debateTeams!)
      : selectPlayersForGame(config, playerIds, gameType, options);
  const host = config.host; // 不再需要指定主持人席位，使用全局默认主持人
  const selectedProviders = new Set([
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
    debugMode: boolean;
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
    debugMode: Boolean(options.debugMode),
    missingProviders: options.debugMode ? [] : missingProviders,
    realReady: Boolean(options.debugMode) || missingProviders.length === 0,
  };
  if (mode !== 'real') throw new Error('全局已禁用 Mock 模式，只支持真实模式。');
  if (!scopedConfig.debugMode && scopedConfig.missingProviders.length) {
    const missing = scopedConfig.missingProviders
      .map((item) => `${item.provider}(${item.apiKeyEnv})`)
      .join('、');
    throw new Error(
      `真实模式缺少 API Key：${missing}。请在 .env 或 B 端模型管理中配置。`,
    );
  }
  return { ...scopedConfig, mode: 'real' };
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

// ============================================================
// 辩论赛随机分配
// ============================================================

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function handleRandomizeTeams(session: GameSession, playerIds?: (number | string)[]): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = getAiConfig() as any;
    const allPlayers = config.players || [];
    const ids = (playerIds || []).map(Number).filter((n) => n > 0);

    // 确定参与玩家：优先用传入的 playerIds，否则取全部
    const pool = ids.length
      ? allPlayers.filter((p: AiConfigPlayer) => ids.includes(Number(p.id)))
      : allPlayers;

    if (pool.length < 8) {
      session.send({ type: 'error', message: `随机分配至少需要 8 名玩家，当前只有 ${pool.length} 人。` });
      return;
    }

    // 随机排列
    const shuffled = shuffle(pool);
    // 取前 12 人（或全部），最少 8 人
    const selected = shuffled.slice(0, Math.min(12, Math.max(8, shuffled.length)));

    const proIds = selected.slice(0, 4).map((p: AiConfigPlayer) => Number(p.id));
    const conIds = selected.slice(4, 8).map((p: AiConfigPlayer) => Number(p.id));
    const judgeIds = selected.slice(8).map((p: AiConfigPlayer) => Number(p.id));
    const proCaptainId = proIds[0];
    const conCaptainId = conIds[0];

    session.send({
      type: 'teams-randomized',
      debateTeams: {
        proIds,
        conIds,
        judgeIds,
        captainEnabled: true,
        proCaptainId,
        conCaptainId,
      },
    });
  } catch (error) {
    session.send({ type: 'error', message: `随机分配失败：${(error as Error).message}` });
  }
}

export {
  attachGameSocket,
  runSession,
  normalizeGameType,
  getRunner,
  getRequestConfig,
  publicSocketHost,
  selectPlayersForGame,
  getSavedPlayerIds,
  handleRandomizeTeams,
};
