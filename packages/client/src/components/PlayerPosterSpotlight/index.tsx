import { useEffect, useMemo, useState } from 'react';
import {
  getPosterPlayerAvatar,
  getPosterPlayerName,
  resolvePlayerPoster,
} from './posters';
import type { PosterPlayer } from './posters';
import './index.css';

interface PlayerPosterSpotlightProps {
  player?: PosterPlayer | null;
  className?: string;
}

export function PlayerPosterSpotlight({ player, className = '' }: PlayerPosterSpotlightProps) {
  const poster = resolvePlayerPoster(player);
  const avatar = getPosterPlayerAvatar(player);
  const sources = useMemo(() => [...new Set([poster, avatar].filter(Boolean))] as string[], [poster, avatar]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const playerName = getPosterPlayerName(player);
  const imageSource = sources[sourceIndex] || '';

  useEffect(() => {
    setSourceIndex(0);
  }, [player?.id, player?.nickname, player?.name, poster, avatar]);

  if (!player) return null;

  return (
    <aside
      className={`player-poster-spotlight${className ? ` ${className}` : ''}`}
      aria-label={`${playerName}正在发言`}
      aria-live="polite"
    >
      {imageSource && (
        <img
          className="player-poster-spotlight__backdrop"
          src={imageSource}
          alt=""
          aria-hidden="true"
        />
      )}
      <div className="player-poster-spotlight__shade" aria-hidden="true" />
      <div className={`player-poster-spotlight__card${imageSource ? '' : ' is-name-only'}`}>
        {imageSource ? (
          <img
            className="player-poster-spotlight__portrait"
            src={imageSource}
            alt=""
            onError={() => setSourceIndex((index) => index + 1)}
          />
        ) : (
          <span className="player-poster-spotlight__initials" aria-hidden="true">
            {playerName.slice(0, 2).toUpperCase()}
          </span>
        )}
        <footer className="player-poster-spotlight__caption">
          <small>正在发言</small>
          <strong>{playerName}</strong>
        </footer>
      </div>
    </aside>
  );
}

export type { PosterPlayer };
