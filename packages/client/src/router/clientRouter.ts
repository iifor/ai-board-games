import { useEffect, useMemo, useState } from 'react';
import type { Route } from '../types';

const GAME_PATHS = new Set(['debate', 'werewolf']);

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

export function buildGamePath(gameKey: string, options: { gameId?: string } = {}): string {
  const searchParams = new URLSearchParams();
  if (options.gameId) searchParams.set('gameId', options.gameId);
  const params = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return `/games/${gameKey}${params}`;
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

function parseClientRoute(locationState: LocationState): Route {
  const pathname = normalizePath(locationState.pathname);
  const segments = pathname.split('/').filter(Boolean);
  const searchParams = new URLSearchParams(locationState.search);

  if (segments[0] === 'games' && GAME_PATHS.has(segments[1])) {
    return { name: 'game', gameKey: segments[1], searchParams };
  }

  if (segments[0] === 'home') return { name: 'home', searchParams };
  return { name: 'select', searchParams };
}

function normalizePath(value: string): string {
  const path = String(value || '/').trim();
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}
