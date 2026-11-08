import { speechOf } from '@battle/shared';
import { useSentenceCaption } from '../hooks/useSentenceCaption';
import type { SegmentControl } from '../playback/segment';
import { isPlayerSpeech } from '../playback/speechTurns';
import type { StreamItem } from '../types';
import { seatOf } from '../utils';
import './SentenceCaptions.css';

interface SentenceCaptionsProps {
  readonly item: StreamItem | null;
  readonly control: SegmentControl | null;
  readonly announce?: boolean;
}

function CaptionLine({ item, control, announce = false }: SentenceCaptionsProps & { readonly item: StreamItem }) {
  const speech = speechOf(item.event);
  const sentence = useSentenceCaption(speech?.text ?? '', control);
  const speaker = seatOf(item.event.view, speech?.seat ?? null);
  if (!speech?.text.trim()) return null;
  return <div className="sentence-captions" data-team={speaker?.team} data-seq={item.event.seq} aria-label="逐句字幕">
    {announce && !isPlayerSpeech(item.event) &&
      <span className="subtitle-live-only" aria-live="polite" aria-atomic="true">{speech.text}</span>}
    <div className="sentence-caption-line" aria-hidden="true">
      <strong>{speaker ? `${speaker.seat} 号 · ${speaker.name}` : '主持人'}</strong>
      <p key={sentence.index}>{sentence.text}</p>
    </div>
  </div>;
}

export function SentenceCaptions(props: SentenceCaptionsProps) {
  return props.item ? <CaptionLine key={props.item.event.seq} {...props} item={props.item} /> : null;
}
