export type Route =
  | { name: 'game'; gameKey: string; searchParams: URLSearchParams }
  | { name: 'home'; searchParams: URLSearchParams }
  | { name: 'select'; searchParams: URLSearchParams };
