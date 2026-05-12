export async function fetchAiPlayers() {
  const response = await fetch('/api/toc/health');
  if (!response.ok) throw new Error('无法获取 AI 玩家配置');
  const data = await response.json();
  return data.players || [];
}

export async function fetchPlayerSelections() {
  const response = await fetch('/api/toc/player-selections');
  if (!response.ok) throw new Error('无法获取玩家选择配置');
  const data = await response.json();
  return data.selections || {};
}

export async function fetchDebateReplayOptions() {
  const response = await fetch('/api/toc/game-logs/debate?realOnly=1');
  if (!response.ok) throw new Error('无法获取辩论赛历史对局');
  const data = await response.json();
  return data.logs || [];
}

export async function savePlayerSelection(gameType, playerIds) {
  const response = await fetch(`/api/toc/player-selections/${gameType}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerIds })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || data.message || '保存玩家选择失败');
  }
  return response.json();
}

export function openGameSocket({ mode, gameType = 'consensus', playerIds = [], topic, debateTeams, mockReplayId, mockReplayGame, werewolfMode, onEvent, onError, onClose }) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/api/toc/ws/game`);

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'start', mode, gameType, playerIds, topic, debateTeams, mockReplayId, mockReplayGame, werewolfMode }));
  };

  socket.onmessage = (message) => {
    onEvent(JSON.parse(message.data), socket);
  };

  socket.onerror = () => {
    onError(new Error('WebSocket 连接失败，请检查后端服务。'));
  };

  socket.onclose = () => {
    onClose?.();
  };

  return socket;
}
