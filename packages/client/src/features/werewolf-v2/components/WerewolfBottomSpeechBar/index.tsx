import { Mic2 } from 'lucide-react';
import { formatWerewolfSeatLabel } from '../../../werewolf/utils';
import { splitPlayableDisplaySegments } from '../../../../utils/playableText';
import type { Player, SpeechState } from '../../../../types';
import './index.css';

interface WerewolfBottomSpeechBarProps {
  speech: SpeechState | null;
  players: Player[];
  streamMessage: string;
}

const WAVE_BARS = Array.from({ length: 18 }, (_, index) => index);

export function WerewolfBottomSpeechBar({ speech, players, streamMessage }: WerewolfBottomSpeechBarProps) {
  const speakerLabel = speech?.playerId ? formatWerewolfSeatLabel(speech.playerId, players) : '主持人';
  const text = speech?.fullText || speech?.text || streamMessage || '等待下一位玩家发言';
  const lines = splitPlayableDisplaySegments(text, { maxChars: 42 });

  return (
    <section className="werewolf-v2-bottom-speech" aria-live="polite">
      <div className="werewolf-v2-bottom-speech__copy">
        <span><Mic2 size={15} />正在发言 · {speakerLabel}</span>
        <div className="werewolf-v2-bottom-speech__lines">
          {lines.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
        </div>
      </div>
      <div className="werewolf-v2-bottom-speech__wave" aria-hidden="true">
        {WAVE_BARS.map((bar) => <i key={bar} style={{ '--bar-index': bar } as React.CSSProperties} />)}
      </div>
    </section>
  );
}
