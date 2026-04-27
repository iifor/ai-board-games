export async function fetchMockGame() {
  const response = await fetch('/api/games/new?mode=mock');
  if (!response.ok) throw new Error('无法获取 Mock 对局');
  return response.json();
}

export async function fetchGameHistory() {
  const response = await fetch('/api/history');
  if (!response.ok) throw new Error('无法获取历史对局');
  return response.json();
}

export function openGameStream({ onEvent, onError }) {
  const source = new EventSource('/api/games/stream?mode=real');

  source.onmessage = (message) => {
    onEvent(JSON.parse(message.data));
  };

  source.onerror = () => {
    onError(new Error('推送连接中断，请检查后端、网络或 API 配置。'));
    source.close();
  };

  return source;
}
