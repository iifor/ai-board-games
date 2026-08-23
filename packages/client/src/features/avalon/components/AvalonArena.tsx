import { Crown, ShieldCheck, Skull, Users } from 'lucide-react';
import type { AvalonPublicState, AvalonRoleId } from '@ai-presenter/shared/types/avalon';

interface AvalonArenaProps {
  game: AvalonPublicState;
  message: string;
}

function AvalonArena({ game, message }: AvalonArenaProps) {
  const revealByPlayer = new Map((game.reveal || []).map((item) => [item.playerId, item]));
  return (
    <section className="avalon-arena" aria-label="阿瓦隆对局">
      <header className="avalon-scoreboard">
        <span><ShieldCheck aria-hidden="true" />好人 {game.goodScore}</span>
        <strong>第 {game.missionNumber} 任务 · 第 {game.proposalAttempt} 次组队</strong>
        <span><Skull aria-hidden="true" />邪恶 {game.evilScore}</span>
      </header>

      <div className="avalon-missions">
        {game.missions.map((mission) => (
          <article key={mission.number} className={`is-${mission.status}`}>
            <strong>{mission.number}</strong>
            <span>{mission.teamSize} 人任务</span>
            <em>{mission.status === 'success' ? '成功' : mission.status === 'fail' ? '失败' : '待执行'}</em>
          </article>
        ))}
      </div>

      <div className="avalon-table">
        {game.players.map((player) => {
          const selected = game.currentTeamIds.includes(player.id);
          const reveal = revealByPlayer.get(player.id);
          return (
            <article className={selected ? 'is-selected' : ''} key={player.id}>
              <div className="avalon-avatar">
                {player.avatar ? <img src={player.avatar} alt="" /> : <Users aria-hidden="true" />}
                {game.leaderId === player.id && <Crown className="avalon-leader" aria-label="当前队长" />}
              </div>
              <strong>{player.id}号 {player.nickname}</strong>
              <span>{selected ? '任务队员' : '等待组队'}</span>
              {reveal && <em className={`is-${reveal.faction}`}>{roleLabel(reveal.role)}</em>}
            </article>
          );
        })}
      </div>

      <p className="avalon-narration" aria-live="polite">{message}</p>
      {game.winner && (
        <section className={`avalon-result is-${game.winner}`}>
          <h2>{game.winner === 'good' ? '好人阵营获胜' : '邪恶阵营获胜'}</h2>
          <p>{game.winReason}</p>
        </section>
      )}
    </section>
  );
}

function roleLabel(role: AvalonRoleId): string {
  return ({
    merlin: '梅林',
    percival: '派西维尔',
    loyal_servant: '忠臣',
    assassin: '刺客',
    morgana: '莫甘娜',
  } satisfies Record<AvalonRoleId, string>)[role];
}

export { AvalonArena };
