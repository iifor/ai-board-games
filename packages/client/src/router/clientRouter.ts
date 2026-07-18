import { useEffect, useMemo, useState } from 'react';
import type { Route } from '../types';

const GAME_PATHS = new Set(['debate', 'werewolf', 'undercover']);
type GameRouteVersion = 'v1' | 'v2';

interface LocationState {
  pathname: string;
  search: string;
}

export function useClientRouter() {
  const [locationState, setLocationState] = useState<LocationState>(() => readLocation());

  useEffect(() => {
    const handlePopState = () => setLocationState(readLocation());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const route = useMemo(() => parseClientRoute(locationState), [locationState]);

  function navigate(to: string, options: { replace?: boolean } = {}) {
    const nextUrl = normalizePath(to);
    if (options.replace) window.history.replaceState(null, '', nextUrl);
    else window.history.pushState(null, '', nextUrl);
    setLocationState(readLocation());
  }

  return { route, navigate };
}

export function buildGamePath(gameKey: string, options: { gameId?: string; version?: GameRouteVersion } = {}): string {
  const searchParams = new URLSearchParams();
  if (options.gameId) searchParams.set('gameId', options.gameId);
  const params = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const basePath = options.version === 'v2' ? `/game/v2/${gameKey}` : `/games/${gameKey}`;
  return `${basePath}${params}`;
}

export function getRouteGameId(route: Route): string {
  return route.searchParams.get('gameId') || '';
}

function readLocation(): LocationState {
  return {
    pathname: window.location.pathname,
    search: window.location.search
  };
}

export function parseClientRoute(locationState: LocationState): Route {
  const pathname = normalizePath(locationState.pathname);
  const segments = pathname.split('/').filter(Boolean);
  const searchParams = new URLSearchParams(locationState.search);

  if (segments[0] === 'game' && segments[1] === 'v2' && GAME_PATHS.has(segments[2])) {
    return { name: 'game', gameKey: segments[2], version: 'v2', searchParams };
  }

  if (segments[0] === 'games' && GAME_PATHS.has(segments[1])) {
    return { name: 'game', gameKey: segments[1], version: 'v1', searchParams };
  }

  if (segments[0] === 'home') return { name: 'home', searchParams };
  return { name: 'select', searchParams };
}

function normalizePath(value: string): string {
  const path = String(value || '/').trim();
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}
