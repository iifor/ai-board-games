import { Bot } from 'lucide-react';
import { PlayerPosterSpotlight } from '../../../components/PlayerPosterSpotlight';
import { getHostPosterPlayer, isVisualQaHostEnabled } from '../../../components/PlayerPosterSpotlight/posters';
import type { SpeechState } from '../../../types';
import type { UndercoverHost, UndercoverPublicState } from '../types';
import { getUndercoverPlayerLabel, getUndercoverVoteSummary } from './undercoverVoteSummary';
import './UndercoverArena.css';

interface UndercoverArenaProps {
  game: UndercoverPublicState;
  host?: UndercoverHost | null;
  activeSpeech?: SpeechState | null;
  variant?: 'classic' | 'v2';
  showPlayerPoster?: boolean;
}

export function getUndercoverArenaViewModel(game: UndercoverPublicState, variant: 'classic' | 'v2' = 'classic') {
  const roundSpeeches = game.speeches.filter((speech) => speech.round === game.round);
  const currentSpeech = game.status === 'speaking' ? roundSpeeches.at(-1) : undefined;
  const currentSpeakerId = currentSpeech?.playerId;
  const currentPlayer = game.players.find((player) => player.id === currentSpeakerId);
  const alivePlayers = game.players.filter((player) => player.alive);
  const currentIndex = alivePlayers.findIndex((player) => player.id === currentSpeakerId);
  const nextPlayer = currentIndex >= 0 ? alivePlayers[currentIndex + 1] : undefined;
  return { variant, roundSpeeches, currentSpeech, currentSpeakerId, currentPlayer, alivePlayers, nextPlayer };
}

export function UndercoverArena({ game, host, activeSpeech, variant, showPlayerPoster = false }: UndercoverArenaProps) {
  variant ??= showPlayerPoster ? 'v2' : 'classic';
  const view = getUndercoverArenaViewModel(game, variant);
  const voteSummary = getUndercoverVoteSummary(game);
  const hostSpeaking = (
    activeSpeech?.speakerRole === 'host' && Boolean(activeSpeech.text)
  ) || (
    view.variant === 'v2'
    && isVisualQaHostEnabled(
      typeof window === 'undefined' ? '' : window.location.search,
      typeof document !== 'undefined' && document.querySelector('script[src*="/@vite/client"]') !== null,
    )
  );
  const spotlightPlayer = hostSpeaking ? getHostPosterPlayer(host) : view.currentPlayer;

  if (view.variant === 'classic') {
    return (
      <section className="undercover-arena" aria-label="谁是卧底对局">
        <header>
          <p>第 {game.round} 轮</p>
          <h2>{getPhaseLabel(game.status, variant)}</h2>
        </header>

        <div className="undercover-seats">
          {Array.from({ length: 6 }, (_, index) => {
            const player = game.players[index];
            const speaking = player?.id === view.currentSpeakerId;
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
            {view.roundSpeeches.length ? (
              <ol>
                {view.roundSpeeches.map((speech) => (
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

  return (
    <section
      className={`undercover-stage undercover-stage--${game.status} undercover-stage--v2`}
      aria-label="谁是卧底对局"
    >
      {spotlightPlayer && (
        <PlayerPosterSpotlight
          key={spotlightPlayer.id}
          player={spotlightPlayer}
          className={hostSpeaking
            ? 'undercover-speaker-poster undercover-host-poster'
            : 'undercover-speaker-poster'}
          variant={hostSpeaking ? 'cutout' : 'poster'}
          fallback={hostSpeaking ? 'none' : 'initials'}
          decorative={hostSpeaking}
        />
      )}
      <header className="undercover-round-heading">
        <strong>第 <b>{game.round}</b> 轮</strong>
        <i>·</i>
        <span>{getPhaseLabel(game.status, variant)}</span>
        {game.status === 'speaking' && <small>{Math.min(view.roundSpeeches.length, view.alivePlayers.length)}/{view.alivePlayers.length}</small>}
      </header>

      <div className="undercover-stage-seats">
        {Array.from({ length: 6 }, (_, index) => {
          const player = game.players[index];
          const speaking = player?.id === view.currentSpeakerId;
          return (
            <article
              className={`undercover-player-seat seat-${index + 1}${speaking ? ' is-speaking' : ''}${player && !player.alive ? ' is-eliminated' : ''}`}
              key={player?.id || `empty-${index}`}
            >
              <span className="undercover-player-icon">
                {player?.avatar ? <img src={player.avatar} alt="" /> : <Bot aria-hidden="true" />}
              </span>
              <span className="undercover-player-name">
                <b>{player ? `${player.id}号` : `${index + 1}号`}</b>
                <strong>{player?.nickname || '等待玩家'}</strong>
              </span>
              <em>{player ? (!player.alive ? '已出局' : speaking ? '发言中' : '存活') : '空位'}</em>
            </article>
          );
        })}
      </div>

      <section className="undercover-focus" aria-live="polite">
        {game.status === 'speaking' && (
          <div className="undercover-speaker-strip">
            <span className="undercover-speaker-identity">
              <small>当前发言</small>
              <strong>
                {view.currentSpeakerId
                  ? getUndercoverPlayerLabel(game, view.currentSpeakerId)
                  : '等待发言'}
              </strong>
            </span>
            <blockquote className="undercover-speaker-copy">
              {view.currentSpeech?.text || '首位玩家正在整理描述。'}
            </blockquote>
            <span className="undercover-next-player">
              <small>{view.nextPlayer ? '下一位' : '发言顺序'}</small>
              <strong>
                {view.nextPlayer
                  ? getUndercoverPlayerLabel(game, view.nextPlayer.id)
                  : '本轮最后一位'}
              </strong>
            </span>
          </div>
        )}

        {game.status === 'voting' && (
          <>
            <p>{game.voteResult ? '票型公布' : '投票进行中'}</p>
            <h2>{game.voteResult?.eliminatedPlayerId
              ? `${getUndercoverPlayerLabel(game, game.voteResult.eliminatedPlayerId)} 出局`
              : 'AI 玩家正在判断'}</h2>
            {game.voteResult ? (
              <ul className="undercover-tally">
                {Object.entries(game.voteResult.tally).map(([playerId, votes]) => (
                  <li key={playerId}>{getUndercoverPlayerLabel(game, Number(playerId))}<b>{votes} 票</b></li>
                ))}
              </ul>
            ) : <small>结果将在所有玩家完成投票后公布</small>}
            {voteSummary.map((item) => <small className="undercover-vote-summary" key={item}>{item}</small>)}
          </>
        )}

        {game.status === 'setup' && <><p>六人推理局</p><h2>等待游戏开始</h2><small>词语与身份将在终局统一揭晓</small></>}

        {game.status === 'completed' && game.reveal && (
          <section className="undercover-reveal" aria-label="终局揭晓">
            <p>{game.winner === 'civilians' ? '平民阵营获胜' : '卧底阵营获胜'}</p>
            <h2>终局身份揭晓</h2>
            <dl>
              <div><dt>平民词</dt><dd>{game.reveal.civilianWord}</dd></div>
              <div><dt>卧底词</dt><dd>{game.reveal.undercoverWord}</dd></div>
              <div><dt>卧底玩家</dt><dd>{getUndercoverPlayerLabel(game, game.reveal.undercoverPlayerId)}</dd></div>
            </dl>
            {game.winReason && <small>{game.winReason}</small>}
          </section>
        )}
      </section>
    </section>
  );
}

function getPhaseLabel(status: UndercoverPublicState['status'], variant: 'classic' | 'v2'): string {
  if (status === 'speaking') return variant === 'v2' ? '依次发言' : '依次描述';
  if (status === 'voting') return '投票淘汰';
  if (status === 'completed') return '终局揭晓';
  return '准备开始';
}
