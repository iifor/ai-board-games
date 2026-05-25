import { createNightStartHandler, createDayStartHandler, createInstantHandler } from './phaseHandlers';
import { createActionWindowHandler } from './actionWindowHandler';
import { createNightResolveHandler, createExileResolveHandler } from './resolveHandlers';
import { createCheckWinHandler, createFinalizeHandler } from './resultHandlers';

function createWerewolfHandlers() {
  return {
    'werewolf.assign_roles': createInstantHandler('werewolf_phase_changed', 'roles assigned'),
    'werewolf.night_start': createNightStartHandler(),
    'werewolf.action_window': createActionWindowHandler(),
    'werewolf.night_resolve': createNightResolveHandler(),
    'werewolf.day_start': createDayStartHandler(),
    'werewolf.exile_resolve': createExileResolveHandler(),
    'werewolf.check_win': createCheckWinHandler(),
    'werewolf.finalize': createFinalizeHandler()
  };
}

export { createWerewolfHandlers };
