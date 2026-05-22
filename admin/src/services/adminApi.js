export async function adminRequest(path, options = {}) {
  const response = await fetch(`/api/admin${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || '后台请求失败');
    error.template = data?.template || null;
    error.payload = data;
    throw error;
  }
  return data?.code === 0 && Object.prototype.hasOwnProperty.call(data, 'data')
    ? data.data
    : data;
}
