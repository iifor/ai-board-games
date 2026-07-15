import { Mic2 } from 'lucide-react';
import { PlayerAvatar } from '../../../../components/common/BaseModal';
import { getWerewolfSeatNumber } from '../../../werewolf/utils';
import { resolveWerewolfActiveSubtitle, resolveWerewolfSpeechSpeaker } from '../../utils/interactionState';
import type { Player, SpeechState } from '../../../../types';
import './index.css';

interface WerewolfBottomSpeechBarProps {
  speech: SpeechState | null;
  players: Player[];
  streamMessage: string;
}

export function WerewolfBottomSpeechBar({ speech, players, streamMessage }: WerewolfBottomSpeechBarProps) {
  const speaker = resolveWerewolfSpeechSpeaker(speech, players);
  const speakerName = speaker?.nickname || speaker?.name || '主持人';
  const speakerMeta = speaker ? `${getWerewolfSeatNumber(speaker.id, players)}号玩家` : '系统播报';
  const text = resolveWerewolfActiveSubtitle(speech, streamMessage || '等待下一位玩家发言');

  return (
    <section className="werewolf-v2-bottom-speech" aria-live="polite">
      <div className="werewolf-v2-bottom-speech__speaker">
        <PlayerAvatar player={speaker} fallback="主" className="werewolf-v2-bottom-speech__avatar">
          {!speaker ? <Mic2 size={20} aria-hidden="true" /> : null}
        </PlayerAvatar>
        <span><small>{speakerMeta}</small><strong>{speakerName}</strong></span>
      </div>
      <div className="werewolf-v2-bottom-speech__copy">
        <div className="werewolf-v2-bottom-speech__lines">
          <p>{text}</p>
        </div>
      </div>
    </section>
  );
}
