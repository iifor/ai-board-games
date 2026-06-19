import { ChevronDown, Mic2 } from 'lucide-react';
import { formatWerewolfSeatLabel } from '../../../werewolf/utils';
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
  const text = speech?.text || speech?.fullText || streamMessage || '等待下一位玩家发言';

  return (
    <section className="werewolf-v2-bottom-speech" aria-live="polite">
      <div className="werewolf-v2-bottom-speech__copy">
        <span><Mic2 size={15} />正在发言 · {speakerLabel}</span>
        <p>{text}</p>
      </div>
      <div className="werewolf-v2-bottom-speech__wave" aria-hidden="true">
        {WAVE_BARS.map((bar) => <i key={bar} style={{ '--bar-index': bar } as React.CSSProperties} />)}
      </div>
      <button type="button" aria-label="展开发言内容"><ChevronDown size={18} /></button>
    </section>
  );
}
