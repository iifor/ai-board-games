import type { CompiledGame } from '@battle/engine';
import { debateGame } from './debate';
import { werewolfGame } from './werewolf';

/** 已注册的全部游戏：服务端按 key 查找 */
export const GAMES: readonly CompiledGame[] = [debateGame, werewolfGame];

export const gameRegistry: ReadonlyMap<string, CompiledGame> = new Map(GAMES.map((game) => [game.spec.key, game]));

export { debateGame } from './debate';
export type { DebateParams, DebateState, DebateTopic } from './debate';
export { werewolfGame } from './werewolf';
export type { WerewolfParams, WerewolfState } from './werewolf';
