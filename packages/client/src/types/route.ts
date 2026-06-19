export type Route =
  | { name: 'game'; gameKey: string; version: 'v1' | 'v2'; searchParams: URLSearchParams }
  | { name: 'home'; searchParams: URLSearchParams }
  | { name: 'select'; searchParams: URLSearchParams };
