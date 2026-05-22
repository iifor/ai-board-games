const SPEECH_ACK_TIMEOUT_MS = 120000;

function createSession(socket) {
  let nextId = 1;
  const pending = new Map();
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

  return {
    send(payload) {
      if (socket.readyState !== socket.OPEN) return;
      socket.send(JSON.stringify(payload));
    },
    sendAndWait(payload) {
      if (closed || socket.readyState !== socket.OPEN) return Promise.reject(createSessionCancelledError());
      const payloadPhaseKey = getEventPhaseKey(payload);
      if (skipPhaseKey && payloadPhaseKey === skipPhaseKey) return Promise.resolve();
      if (skipPhaseKey && payloadPhaseKey && payloadPhaseKey !== skipPhaseKey) skipPhaseKey = '';
      const ackId = nextId;
      nextId += 1;
      socket.send(JSON.stringify({ ...payload, ackId }));
      return new Promise((resolve, reject) => {
        const item = { resolve, reject, promptCount: 0, timer: null, payload };
        if (isSpeechWaitPayload(payload)) {
          item.timer = setTimeout(() => handleSpeechAckTimeout(ackId), SPEECH_ACK_TIMEOUT_MS);
        }
        pending.set(ackId, item);
      });
    },
    resolveAck(ackId) {
      const item = pending.get(ackId);
      if (!item) return;
      if (item.timer) clearTimeout(item.timer);
      pending.delete(ackId);
      item.resolve();
    },
    close() {
      if (socket.readyState === socket.OPEN) socket.close();
    },
    setPaused(value) {
      paused = Boolean(value);
      for (const [ackId, item] of pending.entries()) {
        if (!isSpeechWaitPayload(item.payload)) continue;
        if (item.timer) {
          clearTimeout(item.timer);
          item.timer = null;
        }
        if (!paused) {
          item.timer = setTimeout(() => handleSpeechAckTimeout(ackId), SPEECH_ACK_TIMEOUT_MS);
        }
      }
    },
    skipCurrentPhase() {
      let targetPhaseKey = '';
      for (const [ackId, item] of pending.entries()) {
        const key = getEventPhaseKey(item.payload);
        if (!targetPhaseKey && key) targetPhaseKey = key;
        if (item.timer) clearTimeout(item.timer);
        pending.delete(ackId);
        item.resolve();
      }
      if (targetPhaseKey) skipPhaseKey = targetPhaseKey;
    }
  };

  function handleSpeechAckTimeout(ackId) {
    const item = pending.get(ackId);
    if (!item || closed || socket.readyState !== socket.OPEN) return;
    if (paused) {
      item.timer = null;
      return;
    }

    item.promptCount += 1;
    if (item.promptCount <= 2) {
      socket.send(JSON.stringify({
        type: 'host',
        message: `主持人提醒：当前玩家超过30秒未完成发言，请继续发言。（第${item.promptCount}次提醒）`
      }));
      item.timer = setTimeout(() => handleSpeechAckTimeout(ackId), SPEECH_ACK_TIMEOUT_MS);
      return;
    }

    socket.send(JSON.stringify({
      type: 'host',
      message: '主持人提示：本次发言超时超过两次，跳过本次发言，进入下一位。'
    }));
    pending.delete(ackId);
    item.resolve();
  }
}

function isSpeechWaitPayload(payload) {
  return payload?.type === 'speech'
    || payload?.type === 'wolf-speech'
    || payload?.type === 'last-words'
    || payload?.type === 'exile-words';
}

function getEventPhaseKey(event) {
  if (event?.phaseKey) return String(event.phaseKey);
  const phase = event?.phase || event?.round;
  if (!phase) return '';
  return String(phase.id || phase.phase || phase.name || phase.title || phase.number || '');
}

function createSessionCancelledError() {
  const error = new Error('game-session-cancelled');
  error.code = 'GAME_SESSION_CANCELLED';
  return error;
}

function isSessionCancelled(error) {
  return error?.code === 'GAME_SESSION_CANCELLED' || error?.message === 'game-session-cancelled';
}

function parseMessage(raw) {
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

module.exports = {
  createSession,
  isSpeechWaitPayload,
  getEventPhaseKey,
  createSessionCancelledError,
  isSessionCancelled,
  parseMessage,
  SPEECH_ACK_TIMEOUT_MS
};
