import type { ClientMessage, ServerMessage } from '@battle/shared';
import type { WSMessageReceive } from 'hono/ws';
import { z } from 'zod';

/** 客户端帧的大小上限：hello / ack 只有几十字节，再大的帧不解析直接断开 */
export const MAX_CLIENT_FRAME_BYTES = 16 * 1024;
/** WebSocket 关闭码：违反协议约定（帧过大） */
export const POLICY_VIOLATION_CODE = 1008;

const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), afterSeq: z.number().int().min(0) }),
  z.object({ type: z.literal('ack'), seq: z.number().int().min(0) }),
]) satisfies z.ZodType<ClientMessage>;

/** 帧的字节数（文本按 UTF-8 计），用于在解析之前拒绝过大的帧 */
export function frameBytes(data: WSMessageReceive): number {
  if (typeof data === 'string') return Buffer.byteLength(data, 'utf8');
  if (data instanceof Blob) return data.size;
  return data.byteLength;
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = clientMessageSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function encode(message: ServerMessage): string {
  return JSON.stringify(message);
}

/** 连接只需要的发送与关闭能力，便于测试替换 */
export interface StreamSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}
