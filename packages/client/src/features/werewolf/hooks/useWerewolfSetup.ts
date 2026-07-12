import { useEffect, useState } from 'react';
import { fetchAiPlayers, fetchWerewolfModes } from '../../../services/gameService';
import type { Player, WerewolfMode } from '../../../types';
import { normalizeWerewolfSelectedIds, sortPlayersById, toggleWerewolfPlayerId } from '../utils';
import { selectAvailableWerewolfMode } from '../utils/setup';

export function useWerewolfSetup() {
  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const [werewolfModes, setWerewolfModes] = useState<WerewolfMode[]>([]);
  const [werewolfMode, setWerewolfMode] = useState<WerewolfMode | null>(null);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);
  const [clientViewMode, setClientViewMode] = useState('god');
  const [debugMode, setDebugMode] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [selectedHostId, setSelectedHostId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    fetchWerewolfModes()
      .then((modes: unknown) => {
        const enabledModes = Array.isArray(modes) ? modes as WerewolfMode[] : [];
        setWerewolfModes(enabledModes);
        setWerewolfMode((current) => selectAvailableWerewolfMode(current, enabledModes));
        setLoadError('');
      })
      .catch((error: Error) => {
        setWerewolfModes([]);
        setWerewolfMode(null);
        setLoadError(error.message);
      });
  }, []);

  useEffect(() => {
    if (!modeDialogOpen) return;
    let cancelled = false;
    fetchAiPlayers()
      .then((players: unknown) => {
        if (cancelled) return;
        const sorted = sortPlayersById((players || []) as Player[]);
        setAvailablePlayers(sorted);
        setSelectedPlayerIds((current) => normalizeWerewolfSelectedIds(current, sorted, werewolfMode));
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setAvailablePlayers([]);
        setSetupError(error.message);
      });
    return () => { cancelled = true; };
  }, [modeDialogOpen, werewolfMode?.id]);

  function openDialog(): void {
    setSetupError('');
    setSelectedPlayerIds((current) => normalizeWerewolfSelectedIds(current, availablePlayers, werewolfMode));
    setModeDialogOpen(true);
  }

  function selectMode(mode: WerewolfMode): void {
    setWerewolfMode(mode);
    setSetupError('');
    setSelectedPlayerIds((current) => normalizeWerewolfSelectedIds(current, availablePlayers, mode));
  }

  function togglePlayer(id: number | string): void {
    setSelectedPlayerIds((current) => toggleWerewolfPlayerId(current, id, werewolfMode));
  }

  return {
    modeDialogOpen, setModeDialogOpen,
    werewolfModes,
    werewolfMode, setWerewolfMode,
    availablePlayers,
    selectedPlayerIds, setSelectedPlayerIds,
    clientViewMode, setClientViewMode,
    debugMode, setDebugMode,
    setupError, setSetupError,
    selectedHostId, setSelectedHostId,
    loadError,
    openDialog,
    selectMode,
    togglePlayer,
  };
}
