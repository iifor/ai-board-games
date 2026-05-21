export async function fetchAiPlayers() {
  const data = await fetchAiHealth();
  return data.players || [];
}

export async function fetchAiHealth() {
  const response = await fetch('/api/toc/health');
  if (!response.ok) throw new Error('无法获取 AI 玩家配置');
  return response.json();
}

export async function fetchPlayerSelections() {
  const response = await fetch('/api/toc/player-selections');
  if (!response.ok) throw new Error('无法获取玩家选择配置');
  const data = await response.json();
  return data.selections || {};
}

export async function fetchRecentGames(gameType, limit = 10) {
  const response = await fetch(`/api/toc/games/recent?gameType=${encodeURIComponent(gameType)}&limit=${encodeURIComponent(limit)}`);
  if (!response.ok) throw new Error('无法获取历史对局');
  const data = await response.json();
  return data.games || [];
}

export async function fetchWerewolfModes() {
  const response = await fetch('/api/toc/werewolf-modes');
  if (!response.ok) throw new Error('无法获取狼人杀模式');
  return response.json();
}

export async function fetchGameDetail(id) {
  const response = await fetch(`/api/toc/games/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error('无法获取对局详情');
  return response.json();
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

export function openGameSocket({ gameType = 'debate', playerIds, hostId, topic, debateTeams, werewolfMode, replayGameId, onEvent, onError, onClose }) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/api/toc/ws/game`);

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'start', mode: 'real', gameType, playerIds, hostId, topic, debateTeams, werewolfMode, replayGameId }));
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
