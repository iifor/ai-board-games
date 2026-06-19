import type {
  DeathQueueItem,
  DeathResolutionContext,
} from './types';

function ensureDeathQueue(context: DeathResolutionContext): DeathQueueItem[] {
  const queue = context.checkpoint.deathQueue;
  const known = new Set(queue.map((item) => Number(item.playerId)));
  const initialIds = context.checkpoint.initialDeathIds.map(Number);
  const currentDay = Number(context.round.day || context.step.config.day || 1);
  const actualIds = context.runtime.agents
    .filter((agent) => !agent.alive && Number(agent.deathDay) === currentDay)
    .map((agent) => Number(agent.id));

  for (const playerId of [...initialIds, ...actualIds]) {
    if (!playerId || known.has(playerId)) continue;
    queue.push(createQueueItem(context, playerId, initialIds.includes(playerId)));
    known.add(playerId);
  }
  return queue;
}

function getCurrentDeath(context: DeathResolutionContext): DeathQueueItem | null {
  const queue = ensureDeathQueue(context);
  while (
    context.checkpoint.currentDeathIndex < queue.length
    && isDeathComplete(queue[context.checkpoint.currentDeathIndex])
  ) {
    context.checkpoint.currentDeathIndex += 1;
  }
  return queue[context.checkpoint.currentDeathIndex] || null;
}

function shouldHaveLastWords(
  context: DeathResolutionContext,
  item: DeathQueueItem,
): boolean {
  if (context.checkpoint.source === 'night') return Number(context.round.day) === 1;
  if (context.checkpoint.source === 'self_destruct') return item.initialDeath;
  return item.initialDeath && context.checkpoint.initialDeathIds.some(
    (playerId) => Number(playerId) === Number(item.playerId),
  );
}

function createQueueItem(
  context: DeathResolutionContext,
  playerId: number,
  initialDeath: boolean,
): DeathQueueItem {
  return {
    playerId,
    initialDeath,
    wordsCompleted: context.checkpoint.completedLastWordsIds.includes(playerId),
    skillCompleted: context.checkpoint.completedHunterIds.includes(playerId),
    badgeCompleted: context.checkpoint.completedSheriffIds.includes(playerId),
  };
}

function isDeathComplete(item: DeathQueueItem): boolean {
  return item.wordsCompleted && item.skillCompleted && item.badgeCompleted;
}

export {
  ensureDeathQueue,
  getCurrentDeath,
  shouldHaveLastWords,
};
