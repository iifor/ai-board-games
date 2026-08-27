import { Crown, ShieldCheck, Skull, Users } from 'lucide-react';
import type { AvalonPublicState, AvalonRoleId } from '@ai-presenter/shared/types/avalon';
import { PlayerPosterSpotlight } from '../../../components/PlayerPosterSpotlight';
import { getHostPosterPlayer } from '../../../components/PlayerPosterSpotlight/posters';
import type { SpeechState } from '../../../types';
import type { AvalonHost } from '../types';

interface AvalonArenaProps {
  game: AvalonPublicState;
  host?: AvalonHost | null;
  activeSpeech?: SpeechState | null;
  message: string;
  variant?: 'classic' | 'v2';
}

function AvalonArena({ game, host, activeSpeech, message, variant = 'classic' }: AvalonArenaProps) {
  const revealByPlayer = new Map((game.reveal || []).map((item) => [item.playerId, item]));
  if (variant === 'v2') {
    const currentMission = game.missions.find((mission) => mission.number === game.missionNumber);
    const narration = activeSpeech?.speakerRole === 'host' && activeSpeech.text
      ? activeSpeech.text
      : message;
    return (
      <section className={`avalon-stage avalon-stage--${game.status}`} aria-label="阿瓦隆对局">
        <header className="avalon-stage-hud">
          <strong>第 {game.missionNumber} 任务 · 第 {game.proposalAttempt} 次组队</strong>
          <span>{phaseLabel(game)} · {voteProgressLabel(game, currentMission)}</span>
        </header>

        <ol className="avalon-mission-track" aria-label="五轮任务进度">
          {game.missions.map((mission) => (
            <li
              key={mission.number}
              className={`is-${mission.status}${mission.number === game.missionNumber ? ' is-current' : ''}`}
              aria-current={mission.number === game.missionNumber ? 'step' : undefined}
            >
              <span>{mission.number}</span>
              <strong>{missionStatusLabel(mission.status)}</strong>
              <small>{mission.teamSize} 人任务</small>
            </li>
          ))}
        </ol>

        <PlayerPosterSpotlight
          player={getHostPosterPlayer(host)}
          className="avalon-host-poster"
          variant="cutout"
          fallback="none"
          decorative
        />

        <div className="avalon-stage-seats" aria-label="玩家席位">
          {game.players.map((player, index) => {
            const selected = game.currentTeamIds.includes(player.id);
            const reveal = revealByPlayer.get(player.id);
            return (
              <article
                className={`avalon-player-seat seat-${index + 1}${selected ? ' is-selected' : ''}${game.leaderId === player.id ? ' is-leader' : ''}`}
                key={player.id}
              >
                <span className="avalon-player-avatar">
                  {player.avatar ? <img src={player.avatar} alt="" /> : <Users aria-hidden="true" />}
                  {game.leaderId === player.id && <Crown className="avalon-leader" aria-label="当前队长" />}
                </span>
                <span className="avalon-player-copy">
                  <strong>{player.id}号 {player.nickname}</strong>
                  <small>{playerStatusLabel(game, selected)}</small>
                </span>
                {reveal && <em className={`is-${reveal.faction}`}>{roleLabel(reveal.role)}</em>}
              </article>
            );
          })}
        </div>

        <section className="avalon-stage-narration" aria-live="polite">
          <span>主持播报</span>
          <p>{narration || '王国议事厅正在等待下一项公开事件。'}</p>
        </section>

        <footer className="avalon-stage-score">
          <span className="is-good"><ShieldCheck aria-hidden="true" />好人 <strong>{game.goodScore}</strong></span>
          <small>率先完成 3 次任务的阵营取得优势</small>
          <span className="is-evil"><Skull aria-hidden="true" />邪恶 <strong>{game.evilScore}</strong></span>
        </footer>

        {game.winner && (
          <section className={`avalon-result avalon-stage-result is-${game.winner}`}>
            <h2>{game.winner === 'good' ? '好人阵营获胜' : '邪恶阵营获胜'}</h2>
            <p>{game.winReason}</p>
          </section>
        )}
      </section>
    );
  }

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

function phaseLabel(game: AvalonPublicState): string {
  if (game.status === 'proposing') return '队长组队中';
  if (game.status === 'team-vote') return '全员表决中';
  if (game.status === 'quest') return '任务执行中';
  if (game.status === 'assassination') return '刺客决断';
  if (game.status === 'completed') return '终局揭晓';
  return '身份分配中';
}

function voteProgressLabel(
  game: AvalonPublicState,
  mission: AvalonPublicState['missions'][number] | undefined,
): string {
  if (game.status !== 'team-vote') return missionStatusLabel(mission?.status || 'pending');
  const publicVotes = (mission?.approveCount || 0) + (mission?.rejectCount || 0);
  return publicVotes > 0 ? `${publicVotes}/${game.players.length} 已投票` : '等待全员投票';
}

function playerStatusLabel(game: AvalonPublicState, selected: boolean): string {
  if (selected) return '任务队员';
  if (game.status === 'team-vote') return '等待表决';
  if (game.status === 'quest') return '等待任务结果';
  return '等待组队';
}

function missionStatusLabel(status: AvalonPublicState['missions'][number]['status']): string {
  if (status === 'success') return '任务成功';
  if (status === 'fail') return '任务失败';
  if (status === 'team-vote') return '组队表决';
  if (status === 'quest') return '任务执行';
  return '待执行';
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

export { AvalonArena, missionStatusLabel, phaseLabel, playerStatusLabel, voteProgressLabel };
