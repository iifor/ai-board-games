import express, { Request, Response, NextFunction } from 'express';
import { getAiConfig } from '../config';
import { getDb } from '../db';
import { testOpenAIConnection } from '../modules/llm';
import { getGame, listGames } from '../modules/games';
import { getVoicePackage } from '../modules/voices';
import { listSkins } from '../modules/skins';
import { listWerewolfModes } from '../modules/werewolf-config';
import { isAzureVoice, synthesizeVoiceMedia, synthesizeVoicePreview } from '../modules/tts';
import { AppError, ErrorCodes } from '../utils/errors';

const router = express.Router();

interface PlayerSelectionRow {
  gameType: string;
  playerIdsJson: string;
}

router.get('/health', (_request: Request, response: Response) => {
  const config = getAiConfig();
  const skins = listSkins(true);
  response.json({
    ok: true,
    service: 'ai-presenter-api',
    modeControl: 'frontend-query',
    realReady: config.realReady,
    missingProviders: config.missingProviders,
    usedProviders: config.usedProviderNames,
    configuredProviders: Object.keys(config.configuredProviders || {}),
    skins: {
      count: skins.length,
      names: skins.map((skin: { name: string }) => skin.name)
    },
    host: {
      id: config.host.id || 0,
      name: config.host.name,
      nickname: config.host.nickname,
      controlMode: 'workflow',
      avatar: config.host.avatar || '',
      avatarUrl: config.host.avatarUrl || config.host.avatar || '',
      voicePackageId: config.host.voicePackageId || null
    },
    defaultHostId: config.host.defaultHostPlayerId || config.host.id || null,
    players: config.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      avatar: player.avatar,
      avatarUrl: player.avatarUrl || player.avatar,
      provider: player.provider,
      model: player.model,
      baseUrl: player.baseUrl,
      apiKeyEnv: player.apiKeyEnv,
      hasApiKey: Boolean(player.apiKey),
      sex: player.sex,
      personality: player.personality,
      voicePackageId: player.voicePackageId
    }))
  });
});

router.post('/voice/synthesize', async (request: Request, response: Response, next: NextFunction) => {
  try {
    const text = String((request.body as Record<string, unknown>)?.text || '').trim();
    const voicePackageId = (request.body as Record<string, unknown>)?.voicePackageId;
    if (!text) {
      response.status(400).json({ error: 'EMPTY_TEXT', message: '语音文本不能为空' });
      return;
    }
    const voice = getVoicePackage(voicePackageId as number);
    if (!voice || !voice.enabled) {
      response.status(404).json({ error: 'VOICE_PACKAGE_NOT_FOUND', message: '语音包不存在或未启用' });
      return;
    }
    const audio = await synthesizeVoicePreview(voice, text) as { mimeType?: string; buffer: unknown };
    response.setHeader('Content-Type', audio.mimeType || 'audio/mpeg');
    response.setHeader('Cache-Control', 'no-store');
    response.send(audio.buffer);
  } catch (error) {
    next(error);
  }
});

router.post('/voice/synthesize-media', async (request: Request, response: Response, next: NextFunction) => {
  try {
    const text = String((request.body as Record<string, unknown>)?.text || '').trim();
    const voicePackageId = (request.body as Record<string, unknown>)?.voicePackageId;
    if (!text) throw new AppError(ErrorCodes.VALIDATION_ERROR, '语音文本不能为空', 400);

    const voice = getVoicePackage(voicePackageId as number);
    if (!voice || !voice.enabled) throw new AppError(ErrorCodes.NOT_FOUND, '语音包不存在或未启用', 404);
    if (!isAzureVoice(voice)) {
      response.status(422).json({
        code: 'UNSUPPORTED_VOICE',
        message: '该语音包不支持服务端语音媒体。',
        data: null
      });
      return;
    }

    response.json(await synthesizeVoiceMedia(voice, text));
  } catch (error) {
    next((error as { code?: string }).code === ErrorCodes.UPSTREAM_ERROR
      ? new AppError(ErrorCodes.UPSTREAM_ERROR, 'Azure 语音媒体生成失败', 502)
      : error);
  }
});

router.get('/player-selections', (_request: Request, response: Response, next: NextFunction) => {
  try {
    response.json({ selections: getPlayerSelections() });
  } catch (error) {
    next(error);
  }
});

router.get('/werewolf-modes', (_request: Request, response: Response, next: NextFunction) => {
  try {
    response.json(listWerewolfModes().filter((mode: { enabled: boolean }) => mode.enabled));
  } catch (error) {
    next(error);
  }
});

router.put('/player-selections/:gameType', express.json(), (request: Request, response: Response, next: NextFunction) => {
  try {
    const gameType = normalizeGameType(String(request.params.gameType));
    const playerIds = normalizePlayerIds((request.body as Record<string, unknown>)?.playerIds);
    validatePlayerSelection(gameType, playerIds);
    getDb().prepare(`
      INSERT INTO game_player_selections (game_type, player_ids_json, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(game_type) DO UPDATE SET
        player_ids_json = excluded.player_ids_json,
        updated_at = CURRENT_TIMESTAMP
    `).run(gameType, JSON.stringify(playerIds));
    response.json({ gameType, playerIds });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// 辩论赛随机分配
// ============================================================

router.post('/randomize-debate-teams', express.json(), (request: Request, response: Response, next: NextFunction) => {
  try {
    const config = getAiConfig();
    const allPlayers = config.players || [];
    const body = request.body as Record<string, unknown> | undefined;
    const requestedIds: number[] = Array.isArray(body?.playerIds)
      ? (body!.playerIds as (number | string)[]).map(Number).filter((n) => n > 0)
      : [];

    // 确定参与玩家
    const pool = requestedIds.length
      ? allPlayers.filter((p: { id: number | string }) => requestedIds.includes(Number(p.id)))
      : allPlayers;

    if (pool.length < 8) {
      response.status(400).json({
        error: 'INSUFFICIENT_PLAYERS',
        message: `随机分配至少需要 8 名玩家，当前只有 ${pool.length} 人。`,
      });
      return;
    }

    // 随机排列
    const shuffled = shuffleArray(pool);
    const selected = shuffled.slice(0, Math.min(12, Math.max(8, shuffled.length)));

    const proIds = selected.slice(0, 4).map((p: { id: number | string }) => Number(p.id));
    const conIds = selected.slice(4, 8).map((p: { id: number | string }) => Number(p.id));
    const judgeIds = selected.slice(8).map((p: { id: number | string }) => Number(p.id));

    response.json({
      debateTeams: {
        proIds,
        conIds,
        judgeIds,
        captainEnabled: true,
        proCaptainId: proIds[0],
        conCaptainId: conIds[0],
      },
    });
  } catch (error) {
    next(error);
  }
});

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

router.get('/diagnostics/openai', async (request: Request, response: Response, next: NextFunction) => {
  try {
    const config = getAiConfig();
    const providerName = request.query.provider as string;
    const targets = providerName
      ? [resolveDiagnosticProvider(config as unknown as Record<string, unknown>, providerName)]
      : Object.values(config.providers as Record<string, unknown>);
    const results = await Promise.all(targets.map((provider: unknown) => testOpenAIConnection(provider as Record<string, unknown>)));
    const ok = results.every((result: { ok: boolean }) => result.ok);
    response.status(ok ? 200 : 502).json(providerName ? results[0] : { ok, results: results as unknown[] });
  } catch (error) {
    next(error);
  }
});

router.get('/games/recent', (request: Request, response: Response, next: NextFunction) => {
  try {
    const gameType = normalizeGameType(String(request.query.gameType || 'werewolf'));
    const limit = Math.min(50, Math.max(1, Number(request.query.limit) || 10));
    response.json({ gameType, games: listGames({ gameType }).slice(0, limit) });
  } catch (error) {
    next(error);
  }
});

router.get('/games/:id', (request: Request, response: Response, next: NextFunction) => {
  try {
    const game = getGame(String(request.params.id));
    if (!game) {
      response.status(404).json({ error: 'GAME_NOT_FOUND', message: '历史对局不存在' });
      return;
    }
    response.json(game);
  } catch (error) {
    next(error);
  }
});

function resolveDiagnosticProvider(config: Record<string, unknown>, providerName: string): Record<string, unknown> {
  const providers = config.providers as Record<string, unknown>;
  if (providers[providerName]) return providers[providerName] as Record<string, unknown>;
  const configuredProviders = config.configuredProviders as Record<string, Record<string, unknown>> | undefined;
  const configured = configuredProviders?.[providerName];
  if (configured) {
    const apiKeyEnv = configured.apiKeyEnv as string;
    return {
      name: providerName,
      provider: providerName,
      baseUrl: String(configured.baseUrl || '').replace(/\/$/, ''),
      apiKeyEnv,
      apiKey: configured.apiKey || process.env[apiKeyEnv] || ''
    };
  }
  throw new Error(`未知 provider：${providerName}`);
}

function getPlayerSelections(): Record<string, number[]> {
  const rows = getDb().prepare('SELECT game_type AS gameType, player_ids_json AS playerIdsJson FROM game_player_selections').all() as PlayerSelectionRow[];
  return rows.reduce<Record<string, number[]>>((result, row) => {
    result[row.gameType] = safeParseJson(row.playerIdsJson, []);
    return result;
  }, {});
}

function normalizeGameType(value: string): string {
  if (['debate', 'werewolf'].includes(value)) return value;
  throw new Error(`未知游戏类型：${value}`);
}

function normalizePlayerIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter(Boolean))];
}

function validatePlayerSelection(gameType: string, playerIds: number[]): void {
  if (gameType === 'debate') {
    if (playerIds.length < 8 || playerIds.length > 12) throw new Error('AI 辩论赛需要选择 8-12 位 AI 玩家。');
    return;
  }
  if (gameType === 'werewolf' && playerIds.length !== 12) {
    throw new Error('AI 狼人杀需要选择恰好 12 位 AI 玩家。');
  }
}

function safeParseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default router;
