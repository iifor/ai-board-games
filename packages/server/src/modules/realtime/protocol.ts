import type { ClientMessage, ServerMessage } from '@battle/shared';
import { z } from 'zod';

const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), afterSeq: z.number().int().min(0) }),
  z.object({ type: z.literal('ack'), seq: z.number().int().min(0) }),
]) satisfies z.ZodType<ClientMessage>;

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
