interface WerewolfPresentationState {
  nightActionType: string;
  nightActionActorIds: number[];
  seerCheckTarget: string | null;
  hunterShotFromId: number | null;
}

type PresentationEvent = Record<string, unknown> & {
  type?: string;
  phase?: unknown;
  workflowEvent?: string;
  actionType?: string;
  actionWindow?: { actionType?: string; actorIds?: Array<number | string> };
  nightActionActorIds?: Array<number | string>;
  seerCheck?: { target?: number | string | null };
  witchAction?: Record<string, unknown> | null;
  shot?: { from?: number | string | null };
};

const EMPTY_WEREWOLF_PRESENTATION: WerewolfPresentationState = {
  nightActionType: '',
  nightActionActorIds: [],
  seerCheckTarget: null,
  hunterShotFromId: null,
};

const LEGACY_NIGHT_EVENTS = new Set([
  'wolf-wake', 'wolf-leader', 'seer-wake', 'guard-wake', 'witch-antidote', 'witch-poison',
  'ghost-bride-link', 'ghost-bride-chat', 'ghost-bride-kill', 'escape-hunter-speech',
  'escape-hunter-vote', 'thick-wolf-armor',
]);

const ACTION_NIGHT_TYPES: Record<string, string> = {
  wolf_speech: 'wolf-wake',
  wolf_kill: 'wolf-wake',
  wolf_vote: 'wolf-vote',
  guard_protect: 'guard-wake',
  witch_save: 'witch-antidote',
  witch_poison: 'witch-poison',
  escape_hunter_speech: 'escape-hunter-speech',
  escape_hunter_vote: 'escape-hunter-vote',
  ghost_bride_link: 'ghost-bride-link',
  ghost_bride_chat: 'ghost-bride-chat',
  ghost_bride_kill: 'ghost-bride-kill',
};

export function reduceWerewolfPresentation(state: WerewolfPresentationState, event: PresentationEvent): WerewolfPresentationState {
  const type = String(event.type || '');
  const workflowEvent = String(event.workflowEvent || '');
  const actionType = String(event.actionType || event.actionWindow?.actionType || '');
  const actorIds = ids(event.nightActionActorIds || event.actionWindow?.actorIds);

  if ((type === 'phase-start' && event.phase === 'night') || ['night-result', 'done', 'game'].includes(type)) {
    return EMPTY_WEREWOLF_PRESENTATION;
  }
  if (workflowEvent === 'phase-start' && !actionType) return EMPTY_WEREWOLF_PRESENTATION;
  if (workflowEvent === 'werewolf_action_submitted' && actionType === 'wolf_vote') return EMPTY_WEREWOLF_PRESENTATION;

  if (type === 'seer-check') {
    return { ...state, nightActionType: 'seer-check', seerCheckTarget: stringOrNull(event.seerCheck?.target) };
  }
  if (type === 'wolf-vote' && !actionType) {
    return { ...state, nightActionType: 'wolf-vote', nightActionActorIds: [], seerCheckTarget: null };
  }
  if (type === 'witch-action') {
    const nightActionType = actionType === 'witch_poison' || event.witchAction ? 'witch-poison-action' : 'witch-antidote-action';
    return { ...state, nightActionType, seerCheckTarget: null };
  }
  if (LEGACY_NIGHT_EVENTS.has(type)) {
    return { ...state, nightActionType: type, nightActionActorIds: [], seerCheckTarget: null };
  }

  if (actionType === 'hunter_shot' || type === 'hunter-shot') {
    const hunterShotFromId = numberOrNull(event.shot?.from);
    return hunterShotFromId == null ? state : { ...state, hunterShotFromId };
  }
  if (workflowEvent === 'seer-check') {
    return { ...state, nightActionType: 'seer-check', nightActionActorIds: actorIds, seerCheckTarget: null };
  }
  if (actionType === 'seer_check') {
    return { ...state, nightActionType: '', nightActionActorIds: actorIds, seerCheckTarget: null };
  }

  const nightActionType = ACTION_NIGHT_TYPES[actionType];
  if (nightActionType) return { ...state, nightActionType, nightActionActorIds: actorIds, seerCheckTarget: null };
  if (event.actionWindow) return { ...state, nightActionActorIds: actorIds };
  return state;
}

function ids(values: Array<number | string> | undefined): number[] {
  return (values || []).map(Number).filter(Number.isFinite);
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(number) ? null : number;
}

function stringOrNull(value: unknown): string | null {
  return value === null || value === undefined || value === '' ? null : String(value);
}

export { EMPTY_WEREWOLF_PRESENTATION };
export type { PresentationEvent, WerewolfPresentationState };
