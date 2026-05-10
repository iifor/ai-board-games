import React, { useEffect, useMemo, useState } from 'react';
import { Check, MessagesSquare, Moon, Sparkles, UsersRound } from 'lucide-react';
import { fetchAiPlayers, fetchPlayerSelections, savePlayerSelection } from '../api/gameApi';

const GAME_RULES = {
  consensus: { min: 7, max: 7, recommended: 7, label: '固定 7 人' },
  debate: { min: 8, max: 12, recommended: 12, label: '8-12 人' },
  werewolf: { min: 12, max: 12, recommended: 12, label: '固定 12 人' }
};

const games = [
  { key: 'consensus', title: '共识迷雾', subtitle: '7人推理共识局', tone: 'consensus', icon: <Sparkles size={34} /> },
  { key: 'debate', title: 'AI 辩论赛', subtitle: '正反攻辩与评委点评', tone: 'debate', icon: <MessagesSquare size={34} /> },
  { key: 'werewolf', title: 'AI 狼人杀', subtitle: '12人标准场与扩展模式', tone: 'wolf', icon: <Moon size={34} /> }
];

export function GameSelectPage({ onStartConsensus, onStartDebate, onStartWerewolf }) {
  const [players, setPlayers] = useState([]);
  const [selections, setSelections] = useState({});
  const [editingGame, setEditingGame] = useState('');
  const [draftIds, setDraftIds] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAiPlayers(), fetchPlayerSelections()])
      .then(([playerItems, savedSelections]) => {
        if (cancelled) return;
        setPlayers(playerItems || []);
        setSelections(savedSelections || {});
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const playerMap = useMemo(() => new Map(players.map((player) => [Number(player.id), player])), [players]);

  function getSelection(gameKey) {
    const rule = GAME_RULES[gameKey];
    const saved = Array.isArray(selections[gameKey]) ? selections[gameKey].map(Number).filter((id) => playerMap.has(id)) : [];
    if (isValidSelection(gameKey, saved)) return saved;
    return players.slice(0, rule.recommended).map((player) => player.id);
  }

  function startGame(gameKey) {
    const playerIds = getSelection(gameKey);
    if (gameKey === 'debate') onStartDebate(playerIds);
    else if (gameKey === 'werewolf') onStartWerewolf(playerIds);
    else onStartConsensus(playerIds);
  }

  function openEditor(gameKey) {
    setSaveError('');
    setEditingGame((value) => value === gameKey ? '' : gameKey);
    setDraftIds(getSelection(gameKey));
  }

  function togglePlayer(id) {
    setDraftIds((value) => value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  }

  async function saveSelection(gameKey) {
    if (!isValidSelection(gameKey, draftIds)) return;
    try {
      setSaveError('');
      await savePlayerSelection(gameKey, draftIds);
      setSelections((value) => ({ ...value, [gameKey]: draftIds }));
      setEditingGame('');
    } catch (error) {
      setSaveError(error.message);
    }
  }

  return (
    <main className="game-select-page">
      <section className="game-entry-grid" aria-label="游戏选择">
        {games.map((game) => {
          const selectedIds = getSelection(game.key);
          const isEditing = editingGame === game.key;
          return (
            <article className={`game-entry-card ${game.tone}`} key={game.key}>
              <button type="button" className="game-entry-main" onClick={() => startGame(game.key)}>
                <span className="game-entry-icon">{game.icon}</span>
                <strong>{game.title}</strong>
                <em>{game.subtitle}</em>
              </button>
              <div className="game-entry-actions">
                <span>{selectedIds.length} / {GAME_RULES[game.key].label}</span>
                <button type="button" onClick={() => openEditor(game.key)}>
                  <UsersRound size={18} />
                  选择玩家
                </button>
              </div>
              {isEditing && (
                <GamePlayerEditor
                  gameKey={game.key}
                  players={players}
                  draftIds={draftIds}
                  onToggle={togglePlayer}
                  onSave={() => saveSelection(game.key)}
                  error={saveError || loadError}
                />
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}

function GamePlayerEditor({ gameKey, players, draftIds, onToggle, onSave, error }) {
  const valid = isValidSelection(gameKey, draftIds);
  return (
    <div className="game-player-editor">
      <div className="game-player-options">
        {players.map((player) => {
          const checked = draftIds.includes(player.id);
          return (
            <button type="button" className={checked ? 'checked' : ''} onClick={() => onToggle(player.id)} key={player.id}>
              <span>{player.id}</span>
              <strong>{player.nickname || player.name || `${player.id}号`}</strong>
              {checked && <Check size={14} />}
            </button>
          );
        })}
      </div>
      {error && <p>{error}</p>}
      <button type="button" className="game-player-save" disabled={!valid} onClick={onSave}>保存玩家配置</button>
    </div>
  );
}

function isValidSelection(gameKey, playerIds) {
  const rule = GAME_RULES[gameKey] || GAME_RULES.consensus;
  return playerIds.length >= rule.min && playerIds.length <= rule.max;
}
