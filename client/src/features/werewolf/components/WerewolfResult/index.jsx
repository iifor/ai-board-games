import React from 'react';
import { Shield } from 'lucide-react';
import './index.css';

export function WerewolfResult({ game }) {
  if (!game.winner) return null;
  const winner = game.winner === 'wolves' ? '狼人阵营胜利' : '好人阵营胜利';
  return (
    <section className="werewolf-result">
      <strong><Shield size={18} />{winner}</strong>
      <p>{game.winReason}</p>
    </section>
  );
}
