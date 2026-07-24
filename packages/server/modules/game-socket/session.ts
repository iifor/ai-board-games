import WebSocket from 'ws';
import { z } from 'zod';

const SPEECH_ACK_TIMEOUT_MS = 120000;
const DEFAULT_ACK_TIMEOUT_MS = 15000;

const playerIdSchema = z.union([
  z.number().int().positive(),
  z.string().max(64).regex(/^\d+$/),
]);
const recordSchema = z.record(z.string(), z.unknown());
const playerIdListSchema = z.array(playerIdSchema).max(100);
const debateTeamsSchema = z.object({
  proIds: playerIdListSchema.optional(),
  conIds: playerIdListSchema.optional(),
  judgeIds: playerIdListSchema.optional(),
}).passthrough();
const sessionMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    mode: z.string().max(16).optional(),
    playerIds: playerIdListSchema.optional(),
    gameType: z.string().min(1).max(64).optional(),
    hostId: playerIdSchema.optional(),
    topic: recordSchema.nullable().optional(),
    debateTeams: debateTeamsSchema.nullable().optional(),
    werewolfMode: z.union([z.string().max(64), recordSchema]).optional(),
    replayGameId: z.string().min(1).max(128).optional(),
    clientViewMode: z.string().max(32).optional(),
    debugMode: z.boolean().optional(),
    replayView: z.union([recordSchema, z.boolean()]).optional(),
  }).strict(),
  z.object({
    type: z.literal('ack'),
    ackId: z.union([z.number().finite(), z.string().min(1).max(64)]),
  }).strict(),
  z.object({
    type: z.literal('control'),
    action: z.enum(['pause', 'resume', 'skip-phase']),
  }).strict(),
  z.object({
    type: z.literal('randomize-teams'),
    playerIds: playerIdListSchema.optional(),
  }).strict(),
]);

type SessionMessage = z.infer<typeof sessionMessageSchema>;

interface SessionCancelledError extends Error {
  code: string;
}

interface PendingItem {
  resolve: () => void;
  reject: (error: Error) => void;
  promptCount: number;
  timer: ReturnType<typeof setTimeout> | null;
  payload: Record<string, unknown>;
}

interface SessionEvent {
  type?: string;
  phaseKey?: string;
  phase?: Record<string, unknown>;
  round?: Record<string, unknown>;
  [key: string]: unknown;
}

interface GameSession {
  send: (payload: Record<string, unknown>) => void;
  sendAndWait: (payload: Record<string, unknown>) => Promise<void>;
  resolveAck: (ackId: number | string) => void;
  close: () => void;
  setPaused: (value: boolean) => void;
  skipCurrentPhase: () => void;
}

function createSession(socket: WebSocket): GameSession {
  let nextId = 1;
  const pending = new Map<number, PendingItem>();
  let closed = false;
  let paused = false;
  let skipPhaseKey = '';

  socket.on('close', () => {
    closed = true;
    for (const { reject, timer } of pending.values()) {
      if (timer) clearTimeout(timer);
      reject(createSessionCancelledError());
    }
    pending.clear();
  });

  function send(payload: Record<string, unknown>): void {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify(payload));
  }

  function sendAndWait(payload: Record<string, unknown>): Promise<void> {
    if (closed || socket.readyState !== socket.OPEN) {
      return Promise.reject(createSessionCancelledError());
    }
    const payloadPhaseKey = getEventPhaseKey(payload as SessionEvent);
    if (skipPhaseKey && payloadPhaseKey === skipPhaseKey) return Promise.resolve();
    if (skipPhaseKey && payloadPhaseKey && payloadPhaseKey !== skipPhaseKey) skipPhaseKey = '';
    const ackId = nextId;
    nextId += 1;
    socket.send(JSON.stringify({ ...payload, ackId }));
    return new Promise<void>((resolve, reject) => {
      const item: PendingItem = {
        resolve,
        reject,
        promptCount: 0,
        timer: null,
        payload,
      };
      if (isSpeechWaitPayload(payload)) {
        item.timer = setTimeout(() => handleSpeechAckTimeout(ackId), SPEECH_ACK_TIMEOUT_MS);
      } else {
        // 非发言事件也加超时保护，避免回放永久卡住
        item.timer = setTimeout(() => {
          if (!pending.has(ackId)) return;
          pending.delete(ackId);
          item.resolve();
        }, DEFAULT_ACK_TIMEOUT_MS);
      }
      pending.set(ackId, item);
    });
  }

  function resolveAck(ackId: number | string): void {
    const id = Number(ackId);
    if (!Number.isFinite(id)) return;
    const item = pending.get(id);
    if (!item) return;
    if (item.timer) clearTimeout(item.timer);
    pending.delete(id);
    item.resolve();
  }

  function close(): void {
    if (socket.readyState === socket.OPEN) socket.close();
  }

  function setPaused(value: boolean): void {
    paused = Boolean(value);
    for (const [ackId, item] of pending.entries()) {
      if (item.timer) {
        clearTimeout(item.timer);
        item.timer = null;
      }
      if (!paused) {
        const ms = isSpeechWaitPayload(item.payload) ? SPEECH_ACK_TIMEOUT_MS : DEFAULT_ACK_TIMEOUT_MS;
        if (isSpeechWaitPayload(item.payload)) {
          item.timer = setTimeout(() => handleSpeechAckTimeout(ackId), ms);
        } else {
          item.timer = setTimeout(() => {
            if (!pending.has(ackId)) return;
            pending.delete(ackId);
            item.resolve();
          }, ms);
        }
      }
    }
  }

  function skipCurrentPhase(): void {
    let targetPhaseKey = '';
    for (const [ackId, item] of pending.entries()) {
      const key = getEventPhaseKey(item.payload as SessionEvent);
      if (!targetPhaseKey && key) targetPhaseKey = key;
      if (item.timer) clearTimeout(item.timer);
      pending.delete(ackId);
      item.resolve();
    }
    if (targetPhaseKey) skipPhaseKey = targetPhaseKey;
  }

  function handleSpeechAckTimeout(ackId: number): void {
    const item = pending.get(ackId);
    if (!item || closed || socket.readyState !== socket.OPEN) return;
    if (paused) {
      item.timer = null;
      return;
    }

    item.promptCount += 1;
    if (item.promptCount <= 2) {
      socket.send(
        JSON.stringify({
          type: 'host',
          message: `主持人提醒：当前玩家超过30秒未完成发言，请继续发言。（第${item.promptCount}次提醒）`,
        }),
      );
      item.timer = setTimeout(() => handleSpeechAckTimeout(ackId), SPEECH_ACK_TIMEOUT_MS);
      return;
    }

    socket.send(
      JSON.stringify({
        type: 'host',
        message: '主持人提示：本次发言超时超过两次，跳过本次发言，进入下一位。',
      }),
    );
    pending.delete(ackId);
    item.resolve();
  }

  return { send, sendAndWait, resolveAck, close, setPaused, skipCurrentPhase };
}

function isSpeechWaitPayload(payload: Record<string, unknown>): boolean {
  const audienceCue = payload?.audienceCue as { kind?: unknown } | undefined;
  return (
    audienceCue?.kind === 'rule-intro' ||
    payload?.type === 'speech' ||
    payload?.type === 'wolf-speech' ||
    payload?.type === 'last-words' ||
    payload?.type === 'exile-words'
  );
}

function getEventPhaseKey(event: SessionEvent): string {
  if (event?.phaseKey) return String(event.phaseKey);
  const phase = (event?.phase || event?.round) as Record<string, unknown> | undefined;
  if (!phase) return '';
  return String(phase.id || phase.phase || phase.name || phase.title || phase.number || '');
}

function createSessionCancelledError(): SessionCancelledError {
  const error = new Error('game-session-cancelled') as SessionCancelledError;
  error.code = 'GAME_SESSION_CANCELLED';
  return error;
}

function isSessionCancelled(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | undefined;
  return err?.code === 'GAME_SESSION_CANCELLED' || err?.message === 'game-session-cancelled';
}

function parseMessage(raw: unknown): SessionMessage | null {
  try {
    const result = sessionMessageSchema.safeParse(JSON.parse(String(raw)));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export {
  createSession,
  isSpeechWaitPayload,
  getEventPhaseKey,
  createSessionCancelledError,
  isSessionCancelled,
  parseMessage,
  SPEECH_ACK_TIMEOUT_MS,
};
export type { GameSession, SessionEvent, SessionMessage };
