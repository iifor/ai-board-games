const MATCH_STATUS = Object.freeze({
  RUNNING: 'running',
  WAITING: 'waiting',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PAUSED_DEBUG: 'paused_debug'
});

const BLOCKER_TYPES = Object.freeze({
  AI_TASK: 'AI_TASK',
  HUMAN_ACTION: 'HUMAN_ACTION',
  TIMER: 'TIMER',
  CHILD_TASK_GROUP: 'CHILD_TASK_GROUP'
});

const BLOCKER_STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
  EXPIRED: 'expired',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

const AI_TASK_STATUS = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  RETRYING: 'retrying',
  CANCELLED: 'cancelled'
});

const PENDING_ACTION_STATUS = Object.freeze({
  PENDING: 'pending',
  SUBMITTED: 'submitted',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  FAILED: 'failed'
});

const EVENT_VISIBILITY = Object.freeze({
  PUBLIC: 'public',
  PRIVATE: 'private',
  SYSTEM: 'system'
});

const ACTION_WINDOW_STATUS = Object.freeze({
  OPEN: 'open',
  RESOLVED: 'resolved',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
});

const WEREWOLF_EFFECT_TYPES = Object.freeze({
  KILL: 'kill',
  PROTECT: 'protect',
  INSPECT: 'inspect',
  SAVE: 'save',
  POISON: 'poison',
  EXILE: 'exile',
  HUNTER_SHOT: 'hunter_shot',
  IDIOT_SURVIVE: 'idiot_survive'
});

const WORKFLOW_EFFECT_STATUS = Object.freeze({
  PROPOSED: 'proposed',
  APPLIED: 'applied',
  CANCELLED: 'cancelled',
  FAILED: 'failed'
});

const WORKFLOW_INTERRUPT_STATUS = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  RESOLVED: 'resolved',
  CANCELLED: 'cancelled'
});

export {
  MATCH_STATUS,
  BLOCKER_TYPES,
  BLOCKER_STATUS,
  AI_TASK_STATUS,
  PENDING_ACTION_STATUS,
  EVENT_VISIBILITY,
  ACTION_WINDOW_STATUS,
  WEREWOLF_EFFECT_TYPES,
  WORKFLOW_EFFECT_STATUS,
  WORKFLOW_INTERRUPT_STATUS
};
