import type { WerewolfMode } from '../../../types';

export function selectAvailableWerewolfMode(current: WerewolfMode | null, modes: WerewolfMode[]): WerewolfMode | null {
  return current && modes.some((mode) => mode.id === current.id) ? current : modes[0] || null;
}
