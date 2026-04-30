export async function fetchAiPlayers() {
  const response = await fetch('/api/toc/health');
  if (!response.ok) throw new Error('无法获取 AI 玩家配置');
  const data = await response.json();
  return data.players || [];
}

export function openGameSocket({ mode, playerIds = [], onEvent, onError, onClose }) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/api/toc/ws/game`);

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'start', mode, playerIds }));
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
