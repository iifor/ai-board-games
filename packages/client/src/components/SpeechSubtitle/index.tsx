import { useMemo } from 'react';
import type { SpeechState, Player } from '../../types';
import {
  buildSpeechSubtitleTimeline,
  findActiveCue,
  findActiveWord,
  getWordPlaybackState
} from '../../utils/wordBoundariesToSubtitle';
import './index.css';

interface SpeechSubtitleProps {
  speech: SpeechState | null;
  players?: Player[];
  getSpeakerLabel?: (speech: SpeechState, players: Player[]) => string | null;
  className?: string;
}

export function SpeechSubtitle({ speech, players = [], getSpeakerLabel, className = '', ...slot }: SpeechSubtitleProps) {
  console.log('SpeechSubtitle: ', { speech, players }, slot);
  const text = String(speech?.text || '').trim();
  const hasWordBoundaries = Boolean(speech?.wordBoundaries?.length);
  const hasCurrentTime = speech?.currentTimeMs !== null && speech?.currentTimeMs !== undefined;
  const timeline = useMemo(
    () => buildSpeechSubtitleTimeline(text, speech?.wordBoundaries),
    [text, speech?.wordBoundaries]
  );

  if (!text) return null;

  const speaker = resolveSpeakerLabel(speech, players, getSpeakerLabel);
  const rootClassName = ['speech-subtitle', className].filter(Boolean).join(' ');
  const fallbackClassName = ['speech-subtitle', 'speech-subtitle--fallback', className].filter(Boolean).join(' ');

  if (hasWordBoundaries && !hasCurrentTime) return null;

  if (hasWordBoundaries && timeline.cues.length > 0) {
    const activeCue = findActiveCue(timeline.cues, speech?.currentTimeMs ?? 0);
    const activeWord = findActiveWord(activeCue, speech?.currentTimeMs ?? 0);

    return (
      <aside className={rootClassName} aria-live="polite">
        <p className="speech-subtitle__speaker">{speaker}发言：</p>
        {activeCue?.words.map((word) => {
          const state = getWordPlaybackState(word, activeWord);
          return (
            <span key={word.index} className={`speech-subtitle__word is-${state}`} >{word.text}</span>
          );
        })}
      </aside>
    );
  }

  if (!speech?.playerId) {
    return (
      <aside className={rootClassName} aria-live="polite">
        <p className="speech-subtitle__speaker">{speaker}发言：</p>
        <span>{timeline.fullText || text}</span>
      </aside>
    );
  }

  return (
    <aside className={fallbackClassName} aria-live="polite">
      <p className="speech-subtitle__speaker">{speaker}发言：</p>
      <p>{timeline.fullText || text}</p>
    </aside>
  );
}

function resolveSpeakerLabel(speech: SpeechState | null, players: Player[], getSpeakerLabel?: (speech: SpeechState, players: Player[]) => string | null): string {
  const explicit = String(speech?.speakerLabel || '').trim();
  if (explicit) return explicit;
  const custom = getSpeakerLabel?.(speech!, players);
  if (custom) return custom;
  if (!speech?.playerId) return '主持人';
  const player = players.find((item) => Number(item.id) === Number(speech.playerId));
  return player?.nickname || player?.name || `${speech.playerId}号`;
}
