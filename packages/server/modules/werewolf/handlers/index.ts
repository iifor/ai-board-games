import { createNightStartHandler, createDayStartHandler, createInstantHandler } from './phaseHandlers';
import { createActionWindowHandler } from './actionWindowHandler';
import { createNightResolveHandler, createExileResolveHandler, createSheriffResolveHandler } from './resolveHandlers';
import { createCheckWinHandler, createFinalizeHandler } from './resultHandlers';
import {
  createMvpResultHandler,
  createPostgameCompleteHandler,
  createPostgameDaybreakHandler,
  createPostgameMvpIntroHandler,
} from '../postgame';

function createWerewolfHandlers() {
  return {
    'werewolf.assign_roles': createInstantHandler('werewolf_phase_changed', '', { audienceCue: true }),
    'werewolf.night_start': createNightStartHandler(),
    'werewolf.action_window': createActionWindowHandler(),
    'werewolf.night_resolve': createNightResolveHandler(),
    'werewolf.day_start': createDayStartHandler(),
    'werewolf.sheriff_resolve': createSheriffResolveHandler(),
    'werewolf.exile_resolve': createExileResolveHandler(),
    'werewolf.check_win': createCheckWinHandler(),
    'werewolf.finalize': createFinalizeHandler(),
    'werewolf.postgame_daybreak': createPostgameDaybreakHandler(),
    'werewolf.postgame_mvp_intro': createPostgameMvpIntroHandler(),
    'werewolf.mvp_result': createMvpResultHandler(),
    'werewolf.complete': createPostgameCompleteHandler()
  };
}

export { createWerewolfHandlers };
