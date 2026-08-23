import type {
  ActorId,
  GameSessionPlayer,
  GameSessionPreparationInput,
  GameSessionPreparationResult,
} from '@ai-presenter/shared/types/gameEngine';

interface PlayerSelectionRule {
  min: number;
  max: number;
  defaultCount?: number;
  errorMessage: string;
}

function preparePlayersByRule(
  input: GameSessionPreparationInput,
  rule: PlayerSelectionRule,
): GameSessionPreparationResult {
  const ids = normalizeIds(
    input.requestedPlayerIds.length ? input.requestedPlayerIds : input.savedPlayerIds,
  );
  const defaultCount = rule.defaultCount ?? rule.max;
  const players = ids.length
    ? selectPlayersByIds(input.availablePlayers, ids)
    : input.availablePlayers.slice(0, defaultCount);
  assertPlayerCount(players, rule);
  return { players };
}

function selectPlayersByIds(
  availablePlayers: GameSessionPlayer[],
  ids: ActorId[],
): GameSessionPlayer[] {
  const playerById = new Map(
    availablePlayers.map((player) => [Number(player.id), player]),
  );
  return normalizeIds(ids)
    .map((id) => playerById.get(id))
    .filter((player): player is GameSessionPlayer => Boolean(player));
}

function assertPlayerCount(
  players: GameSessionPlayer[],
  rule: PlayerSelectionRule,
): void {
  if (players.length < rule.min || players.length > rule.max) {
    throw new Error(rule.errorMessage);
  }
}

function normalizeIds(values: ActorId[] | undefined): number[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

export {
  assertPlayerCount,
  normalizeIds,
  preparePlayersByRule,
  selectPlayersByIds,
};
export type { PlayerSelectionRule };
