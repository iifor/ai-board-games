import type { SetupContext } from '@battle/engine';
import { DEFAULT_BOARD, findBoard } from './boards';
import { boardConfig } from './rules/board';
import { initialThief } from './rules/deal';
import { initialKnownWolves } from './rules/loneWolf';
import { emptyNight, type WerewolfParams, type WerewolfState } from './state';
import { initialExtendedState } from './stateExtended';
import { initialExtraState } from './stateExtras';
import { initialFinalState } from './stateFinal';

/** 开局状态：板子信息公开，其余字段按可见性声明投影给对应座位 */
export function initialWerewolfState(ctx: SetupContext<WerewolfParams>): WerewolfState {
  const board = findBoard(ctx.variant?.key ?? DEFAULT_BOARD);
  return {
    board: { key: board.key, name: board.name, rules: board.rules, players: ctx.seats.count() },
    night: emptyNight(),
    guardLastTarget: null,
    hybridMaster: null,
    elderLastTarget: null,
    silencedToday: null,
    knightDuelUsed: false,
    stalkerUsed: false,
    stalkerVote: null,
    butterflyHugs: 0,
    demonChecks: [],
    evilKnightReflected: false,
    nightmareLastTarget: null,
    pendingBlast: null,
    potions: { antidote: true, poison: true },
    pendingDeaths: [],
    lastNightDeaths: [],
    seerChecks: {},
    sheriff: null,
    sheriffCandidates: [],
    speechStart: null,
    idiotRevealed: false,
    exileTarget: null,
    pendingShot: null,
    winnerLock: null,
    mvp: null,
    ...initialExtraState(initialKnownWolves(ctx.seats, boardConfig(ctx))),
    ...initialExtendedState(initialThief(board, ctx.seats)),
    ...initialFinalState(),
  };
}
