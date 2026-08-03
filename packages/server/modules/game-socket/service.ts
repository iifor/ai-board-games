import { WebSocketServer, WebSocket } from 'ws';
import { getDb } from '../../db';
import { createSession, isSessionCancelled, parseMessage } from './session';
import { isDisplayEvent } from './sender';
import {
  createLivePlaybackSource,
  createPlaybackPipeline,
  preparePlaybackEvents,
  toPlaybackEvent,
} from './playback';
import { replayGameSession } from './replay';
import type { GameSession, SessionEvent } from './session';
import { getAiConfig } from '../../config';
import { getWerewolfModeConfig } from '../werewolf-config';
import {
  createProjectionContext,
  projectWerewolfEvent,
  projectWerewolfGame,
} from '../werewolf/views/viewPolicy';
import type { ProjectionContext } from '../werewolf/views/viewPolicy';
import { getActiveTrace, recordEvent, markTraceError, flushTrace } from '../observability';
import { getSpectatorMode } from '../settings/service';
import { sessionStartGuard } from './capacity';
import { resolveGameRunner } from './gameRunner';
import { getGameEngine } from '../engine-registry';

// games is TS — import directly
import { saveGameRecord } from '../games';
import type { SaveGameInput } from '../games';

// --- Interfaces ---

const GAME_SOCKET_MAX_PAYLOAD_BYTES = 64 * 1024;

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

interface GameSocketHandle {
  close: () => Promise<void>;
}

function withSessionDebugMode(
  event: Record<string, unknown>,
  debugMode: boolean,
): Record<string, unknown> {
  return debugMode ? { ...event, debugMode: true } : event;
}

// --- Socket attachment ---

function attachGameSocket(server: import('http').Server): GameSocketHandle {
  const wss = new WebSocketServer({
    server,
    path: '/api/toc/ws/game',
    maxPayload: GAME_SOCKET_MAX_PAYLOAD_BYTES,
  });

  wss.on('connection', (socket: WebSocket) => {
    const session = createSession(socket);

    socket.on('message', async (raw: Buffer | string) => {
      const message = parseMessage(raw);
      if (!message) {
        session.send({
          type: 'error',
          code: 'INVALID_MESSAGE',
          message: '无效的游戏指令。',
        });
        return;
      }

      if (message.type === 'randomize-teams') {
        handleRandomizeTeams(session, message.playerIds);
      }

      if (message.type === 'start') {
        // 观战模式拦截：在消息入口处第一时间拒绝，非回放请求不允许启动新游戏
        if (!message.replayGameId && getSpectatorMode()) {
          session.send({ type: 'error', message: '当前处于观战模式，无法开始新游戏。请联系管理员关闭观战模式。' });
          return;
        }
        sessionStartGuard.run(session, Boolean(message.replayGameId), () => runSession(
          session,
          message.mode || 'real',
          message.playerIds,
          message.gameType,
          {
            topic: message.topic || undefined,
            debateTeams: message.debateTeams || undefined,
            werewolfMode: message.werewolfMode,
            replayGameId: message.replayGameId,
            clientViewMode: message.clientViewMode,
            debugMode: message.debugMode,
            replayView: typeof message.replayView === 'object' ? message.replayView : undefined,
          },
        )).catch((error: unknown) => {
          if (isSessionCancelled(error)) return;
          console.error(error);
          session.send({ type: 'error', message: (error as Error).message });
        });
      }

      if (message.type === 'ack') {
        session.resolveAck(message.ackId);
      }

      if (message.type === 'control') {
        session.setPaused(message.action === 'pause');
        if (message.action === 'skip-phase') session.skipCurrentPhase();
      }
    });
  });

  return {
    close: () => new Promise<void>((resolve, reject) => {
      for (const client of wss.clients) client.terminate();
      wss.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }),
  };
}

// --- Session runner ---

async function runSession(
  session: GameSession,
  mode: string,
  playerIds?: (number | string)[],
  gameType = 'werewolf',
  options: RunSessionOptions = {},
): Promise<void> {
  const resolved = resolveGameRunner(gameType);
  const safeGameType = resolved.gameType;
  if (mode !== 'real') throw new Error('全局已禁用 Mock 模式，只支持真实模式。');
  if (options.replayGameId) {
    await replayGameSession(session, safeGameType, options.replayGameId, { replayView: options.replayView });
    return;
  }
  // Spectator mode check (defense-in-depth, 入口层已有前置检查)
  if (getSpectatorMode()) {
    session.send({ type: 'error', message: '当前处于观战模式，无法开始新游戏。请联系管理员关闭观战模式。' });
    return;
  }
  const config = getRequestConfig(mode, playerIds, safeGameType, options);
  const debugMode = Boolean(config.debugMode);

  const viewMode = String((config as Record<string, unknown>).clientViewMode || 'god');
  const playbackPipeline = createPlaybackPipeline(session, {
    viewMode,
    ...resolved.session.playback,
    capture: true,
  });
  let sessionStartEvent: SessionEvent | null = null;
  let capturedBeforeRuntimeCount = 0;
  if (getGameEngine().getDefinition(safeGameType)?.runtime) {
    const gamePlayers = config.players.map((player) => ({
      id: Number(player.id),
      name: player.name || player.nickname || '',
      nickname: player.nickname || player.name || '',
      avatar: player.avatar || '',
      avatarUrl: player.avatarUrl || player.avatar || '',
      alive: true,
      role: '',
      roleLabel: '',
      faction: '',
    }));
    sessionStartEvent = {
      type: 'host',
      message: resolved.session.startMessage,
      debugMode: Boolean(config.debugMode),
      game: {
        type: safeGameType,
        debugMode: Boolean(config.debugMode),
        host: publicSocketHost(config.host),
        players: gamePlayers,
      },
    };
    await playbackPipeline.send(sessionStartEvent);
    capturedBeforeRuntimeCount = playbackPipeline.getEvents().length;
  }
  const liveSource = createLivePlaybackSource();
  const livePlaybackResult = playbackPipeline.playLive(liveSource).then(
    () => ({ error: null as unknown }),
    (error: unknown) => ({ error }),
  );
  const playbackSourceEvents: SessionEvent[] = [];
  let liveProjectionContext: ProjectionContext | null = null;

  const runner = resolved.run;
  let game: GameRecord | null = null;
  let runnerError: unknown = null;
  try {
    game = (await runner(config, {
      signal: session.signal,
      onEvent: (event: Record<string, unknown>) => {
        if (liveSource) {
          if (safeGameType !== 'werewolf') {
            const sessionEvent = withSessionDebugMode(event, debugMode);
            if (isDisplayEvent(sessionEvent)) playbackSourceEvents.push(sessionEvent);
            liveSource.push(sessionEvent);
            return;
          }
          // 过滤 system channel / visibility 事件，不推送到 C 端
          if (event.channel === 'system' || event.visibility === 'system') return;
          if (viewMode === 'player' && event.game) {
            liveProjectionContext = createProjectionContext(
              event.game as Record<string, unknown>,
              { mode: viewMode },
            );
          }
          if (
            viewMode === 'player'
            && !liveProjectionContext
            && event.channel
            && event.channel !== 'public'
          ) return;
          const projected = viewMode === 'player'
            ? projectWerewolfEvent(
                event as never,
                liveProjectionContext || { mode: 'player' },
              ) as Record<string, unknown> | null
            : event;
          if (projected) {
            const sessionEvent = withSessionDebugMode(projected, debugMode);
            if (isDisplayEvent(sessionEvent)) playbackSourceEvents.push(sessionEvent);
            liveSource.push(sessionEvent);
          }
        }
      },
    })) as GameRecord;
  } catch (error) {
    runnerError = error;
  } finally {
    liveSource?.close();
  }
  if (runnerError) throw runnerError;
  if (!game) throw new Error('游戏流程未返回对局结果。');
  const completedEvent = withSessionDebugMode({
    type:
      safeGameType === 'debate' || safeGameType === 'werewolf'
        ? 'workflow-completed'
        : 'done',
    message: resolved.session.doneMessage,
    game:
      safeGameType === 'werewolf'
        ? projectWerewolfGame(game, createProjectionContext(game))
        : game,
  }, debugMode) as SessionEvent;
  const capturedRuntimeEvents = playbackPipeline
    .freezeCapture()
    .slice(capturedBeforeRuntimeCount);
  const storedStartEvents = sessionStartEvent
    ? [toPlaybackEvent(sessionStartEvent, viewMode, 1)]
    : [];
  const capturedPlaybackEvents = capturedRuntimeEvents.map((event, index) => ({
    ...event,
    sequence: storedStartEvents.length + index + 1,
  }));
  const missingPlaybackEvents = await preparePlaybackEvents(
    [
      ...playbackSourceEvents.slice(capturedRuntimeEvents.length),
      completedEvent,
    ],
    viewMode,
    storedStartEvents.length + capturedPlaybackEvents.length + 1,
  );
  const playbackEvents = [
    ...storedStartEvents,
    ...capturedPlaybackEvents,
    ...missingPlaybackEvents,
  ];
  const preparedCompletedEvent = playbackEvents[playbackEvents.length - 1] || null;

  // 调试模式不保存数据库，只保留 AI 观测数据
  if (!(config as Record<string, unknown>).debugMode) {
    const audioResources = collectPlaybackAudioResources(playbackEvents);
    try {
      saveGameRecord({
        ...game,
        players: withSourcePlayerIds(
          game.players as Array<Record<string, unknown>> | undefined,
          normalizeSelectedPlayerIds(config.selectedPlayerIds),
        ),
        audioResources,
        playbackEvents: playbackEvents,
      } as unknown as SaveGameInput);
    } catch (error) {
      const err = error as Error;
      console.error('[runSession] 保存对局记录失败:', err.message);
      const trace = getActiveTrace((game as Record<string, unknown>)?.id as string || '');
      if (trace) {
        markTraceError(trace, `保存对局记录失败: ${err.message}`);
        recordEvent(trace, { type: 'save-error', phase: '', event: { reason: err.message } });
      }
      throw new Error(`对局保存失败，无法完成播放：${err.message}`);
    }
  }

  // 无论 saveGameRecord 成败，在此最终 flush trace，确保覆盖完整 session 生命周期
  const sessionTrace = getActiveTrace((game as Record<string, unknown>)?.id as string || '');
  if (sessionTrace) { flushTrace(sessionTrace); }

  const { error } = await livePlaybackResult;
  if (error && !isSessionCancelled(error)) throw error;

  if (preparedCompletedEvent) {
    try {
      await playbackPipeline.sendPrepared(preparedCompletedEvent);
    } catch (error) {
      if (!isSessionCancelled(error)) throw error;
    }
  } else {
    await playbackPipeline.send(completedEvent);
  }
  session.close();
}

function collectPlaybackAudioResources(
  events: import('@ai-presenter/shared/types/playbackTypes').PlaybackEvent[],
): string[] {
  return [...new Set(events.flatMap((event) => event.media.map((item) => item.url)).filter(Boolean))];
}

function withSourcePlayerIds(
  players: Array<Record<string, unknown>> | undefined,
  selectedPlayerIds: number[] = [],
): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(players)) return players;
  return players.map((player, index) => ({
    ...player,
    sourcePlayerId: Number(player.sourcePlayerId || selectedPlayerIds[index] || player.id),
  }));
}

function normalizeSelectedPlayerIds(value: unknown): number[] {
  return Array.isArray(value) ? value.map(Number).filter(Boolean) : [];
}

// --- Helpers ---

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
  const selection = getGameEngine()
    .getDefinition(gameType)
    ?.metadata?.session?.playerSelection;
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

  if (selection && (selected.length < selection.min || selected.length > selection.max)) {
    throw new Error(selection.errorMessage);
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
  getRequestConfig,
  publicSocketHost,
  selectPlayersForGame,
  getSavedPlayerIds,
  handleRandomizeTeams,
};
export type { GameSocketHandle };
