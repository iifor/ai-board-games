import type { GameCatalogItem, PublicPlayerDto } from '@battle/shared';
import { http } from './http';

export const fetchCatalog = () => http.get<GameCatalogItem[]>('/api/toc/games');
export const fetchPlayers = () => http.get<PublicPlayerDto[]>('/api/toc/players');
