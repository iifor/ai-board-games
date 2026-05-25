import { Shield } from 'lucide-react';
import type { GameState } from '../../../../types';
import './index.css';

interface WerewolfResultProps {
  game: GameState;
}

export function WerewolfResult({ game }: WerewolfResultProps) {
  if (!game.winner) return null;
  const winner = game.winner === 'wolves' ? '狼人阵营胜利' : '好人阵营胜利';
  return (
    <section className="werewolf-result">
      <strong><Shield size={18} />{winner}</strong>
      <p>{game.winReason}</p>
    </section>
  );
}
