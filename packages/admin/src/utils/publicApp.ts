const defaultOrigin = import.meta.env.DEV ? `${location.protocol}//${location.hostname}:5173` : location.origin;
export const publicOrigin = new URL(import.meta.env.VITE_PUBLIC_APP_URL || defaultOrigin, location.origin).origin;

export function publicMatchUrl(matchId: string) {
  return new URL('/matches/' + encodeURIComponent(matchId), publicOrigin).href;
}
