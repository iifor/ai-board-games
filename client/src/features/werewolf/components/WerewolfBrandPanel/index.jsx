import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './index.css';

export function WerewolfBrandPanel({ game, mode, showRoles, onShowRolesChange }) {
  return (
    <section className="werewolf-title-panel">
      <p>AI 狼人杀</p>
      <span>{mode?.name || game.event?.name}</span>
      <button type="button" onClick={() => onShowRolesChange((value) => !value)}>
        {showRoles ? <Eye size={18} /> : <EyeOff size={18} />}
        <span>{showRoles ? '上帝视角' : '玩家视角'}</span>
      </button>
    </section>
  );
}
