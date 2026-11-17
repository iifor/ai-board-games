import { speechOf, stripSpeechTags } from '@battle/shared';
import { useSentenceCaption } from '../hooks/useSentenceCaption';
import type { SegmentControl } from '../playback/segment';
import { isPlayerSpeech, withAsideTag } from '../playback/speechTurns';
import { hostLabel } from '../playback/describe';
import type { StreamItem } from '../types';
import { seatOf, speakerLabel } from '../utils';
import './SentenceCaptions.css';

interface SentenceCaptionsProps {
  readonly item: StreamItem | null;
  readonly control: SegmentControl | null;
  readonly announce?: boolean;
}

function CaptionLine({ item, control, announce = false }: SentenceCaptionsProps & { readonly item: StreamItem }) {
  const speech = speechOf(item.event);
  const text = stripSpeechTags(speech?.text ?? '');
  const sentence = useSentenceCaption(text, control, item.audio?.captions);
  const speaker = seatOf(item.event.view, speech?.seat ?? null);
  if (!text.trim()) return null;
  const name = speaker ? withAsideTag(speakerLabel(speaker.seat, speaker.name), item.event) : hostLabel(item.event);
  return <div className="sentence-captions" data-team={speaker?.team} data-seq={item.event.seq} aria-label="逐句字幕">
    {announce && !isPlayerSpeech(item.event) &&
      <span className="subtitle-live-only" aria-live="polite" aria-atomic="true">{item.event.channel.startsWith('private:') ? name + '。' : ''}{text}</span>}
    <div className="sentence-caption-line" aria-hidden="true">
      <strong><span>{name}</span></strong>
      <p key={sentence.index}>{sentence.text}</p>
    </div>
  </div>;
}

export function SentenceCaptions(props: SentenceCaptionsProps) {
  return props.item ? <CaptionLine key={props.item.event.seq} {...props} item={props.item} /> : null;
}
