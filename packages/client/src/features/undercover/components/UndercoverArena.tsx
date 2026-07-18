import type { UndercoverPublicState } from '../types';
import { getUndercoverPlayerLabel, getUndercoverVoteSummary } from './undercoverVoteSummary';
import './UndercoverArena.css';

interface UndercoverArenaProps {
  game: UndercoverPublicState;
}

export function UndercoverArena({ game }: UndercoverArenaProps) {
  const roundSpeeches = game.speeches.filter((speech) => speech.round === game.round);
  const currentSpeakerId = game.status === 'speaking' ? roundSpeeches.at(-1)?.playerId : undefined;
  const voteSummary = getUndercoverVoteSummary(game);

  return (
    <section className="undercover-arena" aria-label="谁是卧底对局">
      <header>
        <p>第 {game.round} 轮</p>
        <h2>{getPhaseLabel(game.status)}</h2>
      </header>

      <div className="undercover-seats">
        {Array.from({ length: 6 }, (_, index) => {
          const player = game.players[index];
          const speaking = player?.id === currentSpeakerId;
          return (
            <article
              className={`undercover-seat${speaking ? ' is-speaking' : ''}${player && !player.alive ? ' is-eliminated' : ''}`}
              key={player?.id || `empty-${index}`}
            >
              <span>{player ? `${player.id}号` : `${index + 1}号`}</span>
              <strong>{player?.nickname || '等待玩家'}</strong>
              {speaking && <em>发言中</em>}
              {player && !player.alive && <em>第 {player.eliminatedRound || game.round} 轮淘汰</em>}
            </article>
          );
        })}
      </div>

      <div className="undercover-round-data">
        <section aria-labelledby="undercover-speeches-title">
          <h3 id="undercover-speeches-title">本轮发言</h3>
          {roundSpeeches.length ? (
            <ol>
              {roundSpeeches.map((speech) => (
                <li key={`${speech.round}-${speech.playerId}`}>
                  <strong>{getUndercoverPlayerLabel(game, speech.playerId)}</strong>
                  <span>{speech.text}</span>
                </li>
              ))}
            </ol>
          ) : <p>等待首位玩家发言。</p>}
        </section>

        <section aria-labelledby="undercover-votes-title" aria-live="polite">
          <h3 id="undercover-votes-title">汇总票型</h3>
          {game.voteResult ? (
            <ul>
              {Object.entries(game.voteResult.tally).map(([playerId, votes]) => (
                <li key={playerId}>{getUndercoverPlayerLabel(game, Number(playerId))}：{votes} 票</li>
              ))}
            </ul>
          ) : <p>本轮尚未公布票型。</p>}
          {voteSummary.map((item) => <p className="undercover-vote-summary" key={item}>{item}</p>)}
        </section>
      </div>

      {game.status === 'completed' && game.reveal && (
        <section className="undercover-reveal" aria-label="终局揭晓">
          <h2>{game.winner === 'civilians' ? '平民获胜' : '卧底获胜'}</h2>
          <p>{game.winReason}</p>
          <dl>
            <div><dt>平民词</dt><dd>{game.reveal.civilianWord}</dd></div>
            <div><dt>卧底词</dt><dd>{game.reveal.undercoverWord}</dd></div>
            <div><dt>卧底玩家</dt><dd>{getUndercoverPlayerLabel(game, game.reveal.undercoverPlayerId)}</dd></div>
          </dl>
        </section>
      )}
    </section>
  );
}

function getPhaseLabel(status: UndercoverPublicState['status']): string {
  if (status === 'speaking') return '依次描述';
  if (status === 'voting') return '投票淘汰';
  if (status === 'completed') return '终局揭晓';
  return '准备开始';
}
