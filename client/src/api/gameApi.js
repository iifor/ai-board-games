export function openGameSocket({ mode, onEvent, onError, onClose }) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws/game`);

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'start', mode }));
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
