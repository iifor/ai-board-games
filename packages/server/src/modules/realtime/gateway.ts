import type { UpgradeWebSocket } from 'hono/ws';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { frameBytes, MAX_CLIENT_FRAME_BYTES, parseClientMessage, POLICY_VIOLATION_CODE } from './protocol';
import type { RealtimeService } from './service';
import type { MatchStream } from './session';

const HELLO_TIMEOUT_MS = 10_000;

/** WebSocket：/api/toc/ws/matches/:id —— 客户端先发 hello，再逐个 ack 收到的事件 */
export function realtimeRoutes(upgradeWebSocket: UpgradeWebSocket, realtime: RealtimeService) {
  return new Hono<AppEnv>().get('/matches/:id', upgradeWebSocket((c) => {
    const matchId = c.req.param('id') ?? '';
    let stream: MatchStream | null = null;
    let helloTimer: NodeJS.Timeout | null = null;
    return {
      onOpen(_event, ws) {
        stream = realtime.open(matchId, { send: (data) => ws.send(data), close: (code, reason) => ws.close(code, reason) });
        // 没发 hello 的客户端从头开始推送
        helloTimer = setTimeout(() => stream?.hello(0), HELLO_TIMEOUT_MS);
      },
      onMessage(event, ws) {
        // createNodeWebSocket 不能透传 ws 的 maxPayload，只能在收到帧后、解析之前按大小拒绝
        if (frameBytes(event.data) > MAX_CLIENT_FRAME_BYTES) {
          ws.close(POLICY_VIOLATION_CODE, '消息过大');
          return;
        }
        const message = parseClientMessage(event.data);
        if (!message || !stream) return;
        if (message.type === 'hello') {
          if (helloTimer) clearTimeout(helloTimer);
          stream.hello(message.afterSeq);
        } else {
          void stream.ack(message.seq);
        }
      },
      onClose() {
        if (helloTimer) clearTimeout(helloTimer);
        stream?.dispose();
      },
    };
  }));
}
