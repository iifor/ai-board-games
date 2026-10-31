import type { CompiledGame } from '@battle/engine';
import { debateGame } from './debate';

/** 已注册的全部游戏：服务端按 key 查找 */
export const GAMES: readonly CompiledGame[] = [debateGame];

export const gameRegistry: ReadonlyMap<string, CompiledGame> = new Map(GAMES.map((game) => [game.spec.key, game]));

export { debateGame } from './debate';
export type { DebateParams, DebateState, DebateTopic } from './debate';
