export function formatAvatarUrl(value: string | null | undefined): string {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url.replace(/"/g, '%22');
  if (url.startsWith('/avatars/') || url.startsWith('/resources/uploads/')) return encodeURI(url).replace(/"/g, '%22');
  if (!url.includes('/') && /\.(png|jpe?g|webp|gif|svg)$/i.test(url)) {
    return encodeURI(`/avatars/${url}`).replace(/"/g, '%22');
  }
  return encodeURI(url.startsWith('/') ? url : `/${url}`).replace(/"/g, '%22');
}
