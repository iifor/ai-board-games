import { useEffect, useMemo, useState } from 'react';
import {
  getPosterPlayerAvatar,
  getPosterPlayerName,
  resolvePlayerPoster,
} from './posters';
import type { PlayerPosterVariant, PosterPlayer } from './posters';
import './index.css';

interface PlayerPosterSpotlightProps {
  player?: PosterPlayer | null;
  className?: string;
  variant?: PlayerPosterVariant;
  fallback?: 'initials' | 'none';
  decorative?: boolean;
}

export function PlayerPosterSpotlight({
  player,
  className = '',
  variant = 'poster',
  fallback = 'initials',
  decorative = false,
}: PlayerPosterSpotlightProps) {
  const poster = resolvePlayerPoster(player, variant);
  const avatar = getPosterPlayerAvatar(player);
  const isCutout = variant === 'cutout';
  const sources = useMemo(() => [...new Set([poster, avatar].filter(Boolean))] as string[], [poster, avatar]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const playerName = getPosterPlayerName(player);
  const imageSource = sources[sourceIndex] || '';

  useEffect(() => {
    setSourceIndex(0);
  }, [player?.id, player?.nickname, player?.name, poster, avatar]);

  if (!player || (!imageSource && fallback === 'none')) return null;

  return (
    <aside
      className={`player-poster-spotlight${className ? ` ${className}` : ''}`}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `${playerName}正在发言`}
      aria-live={decorative ? undefined : 'polite'}
    >
      {!isCutout && imageSource && (
        <img
          className="player-poster-spotlight__backdrop"
          src={imageSource}
          alt=""
          aria-hidden="true"
        />
      )}
      {!isCutout && <div className="player-poster-spotlight__shade" aria-hidden="true" />}
      <div className={`player-poster-spotlight__card${isCutout ? ' is-cutout' : ''}${imageSource ? '' : ' is-name-only'}`}>
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
        {!isCutout && (
          <footer className="player-poster-spotlight__caption">
            <small>正在发言</small>
            <strong>{playerName}</strong>
          </footer>
        )}
      </div>
    </aside>
  );
}

export type { PosterPlayer };
