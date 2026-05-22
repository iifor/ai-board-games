import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './index.css';

export function WerewolfBrandPanel({ game, mode, showRoles, onShowRolesChange }) {
  const playerPerspective = game?.clientViewMode === 'player';
  return (
    <section className="werewolf-title-panel">
      <p>AI 狼人杀 {game?.event?.version}</p>
      <span>{mode?.name || game.event?.name}</span>
      <button type="button" onClick={() => !playerPerspective && onShowRolesChange((value) => !value)} disabled={playerPerspective}>
        {showRoles ? <Eye size={18} /> : <EyeOff size={18} />}
        <span>{playerPerspective ? '玩家视角' : showRoles ? '上帝视角' : '隐藏身份'}</span>
      </button>
    </section>
  );
}
