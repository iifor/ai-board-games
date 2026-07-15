import { Crown, Shield } from 'lucide-react';
import type { GameState } from '../../../../types';
import './index.css';

interface WerewolfResultProps {
  game: GameState;
}

export function WerewolfResult({ game }: WerewolfResultProps) {
  if (!game.winner) return null;
  const winner = game.winner === 'wolves' ? '狼人阵营胜利' : '好人阵营胜利';
  const players = game.players || [];
  const mvpName = game.mvp
    ? `${game.mvp.id}号 ${game.mvp.nickname || game.mvp.name || '玩家'}`
    : '';
  const mvpVotes = Object.entries(game.mvpVotes || {})
    .map(([voterId, targetId]) => {
      const voter = players.find((player) => Number(player.id) === Number(voterId));
      const target = players.find((player) => Number(player.id) === Number(targetId));
      return {
        voterId: Number(voterId),
        text: `${voter?.id || voterId}号 ${voter?.nickname || voter?.name || '玩家'} → ${target?.id || targetId}号 ${target?.nickname || target?.name || '玩家'}`,
      };
    })
    .sort((left, right) => left.voterId - right.voterId);
  const mvpVoteCount = game.mvp ? Number(game.mvpVoteTally?.[String(game.mvp.id)] || 0) : 0;
  return (
    <section className="werewolf-result">
      <strong><Shield size={18} />{winner}</strong>
      <p>{game.winReason}</p>
      {game.mvp && (
        <div className="werewolf-result-mvp">
          <span><Crown size={16} />本场 MVP</span>
          <b>{mvpName}</b>
          <small>{game.mvp.roleLabel || game.mvp.role || '身份未知'} · {mvpVoteCount}票</small>
        </div>
      )}
      {mvpVotes.length > 0 && (
        <details className="werewolf-result-votes" open>
          <summary>MVP 投票记录（{mvpVotes.length}票）</summary>
          <ul>
            {mvpVotes.map((vote) => <li key={vote.voterId}>{vote.text}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
