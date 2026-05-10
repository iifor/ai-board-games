import { useEffect, useMemo, useState } from 'react';

const GAME_PATHS = new Set(['consensus', 'debate', 'werewolf']);

export function useClientRouter() {
  const [locationState, setLocationState] = useState(() => readLocation());

  useEffect(() => {
    const handlePopState = () => setLocationState(readLocation());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const route = useMemo(() => parseClientRoute(locationState), [locationState]);

  function navigate(to, options = {}) {
    const nextUrl = normalizePath(to);
    if (options.replace) window.history.replaceState(null, '', nextUrl);
    else window.history.pushState(null, '', nextUrl);
    setLocationState(readLocation());
  }

  return { route, navigate };
}

export function buildGamePath(gameKey, playerIds = []) {
  const cleanIds = playerIds.map(Number).filter(Boolean);
  const params = cleanIds.length ? `?players=${cleanIds.join(',')}` : '';
  return `/games/${gameKey}${params}`;
}

export function getRoutePlayerIds(route) {
  const raw = route.searchParams.get('players') || '';
  return raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter(Boolean);
}

function readLocation() {
  return {
    pathname: window.location.pathname,
    search: window.location.search
  };
}

function parseClientRoute(locationState) {
  const pathname = normalizePath(locationState.pathname);
  const segments = pathname.split('/').filter(Boolean);
  const searchParams = new URLSearchParams(locationState.search);

  if (segments[0] === 'games' && GAME_PATHS.has(segments[1])) {
    return { name: 'game', gameKey: segments[1], searchParams };
  }

  if (segments[0] === 'home') return { name: 'home', searchParams };
  return { name: 'select', searchParams };
}

function normalizePath(value) {
  const path = String(value || '/').trim();
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}
