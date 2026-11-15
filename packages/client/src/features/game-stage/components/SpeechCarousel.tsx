import { useSegmentState } from '../hooks/useSegmentState';
import type { RefObject } from 'react';
import { useFitSpeech } from '../hooks/useFitSpeech';
import { seatOf } from '../utils';
import type { SegmentControl } from '../playback/segment';
import type { PlayerSpeech } from '../playback/speechTurns';
import { PlayerFigure } from './PlayerFigure';
import { SpeechLine } from './SpeechLine';
import { SubtitleProgress } from './SubtitleProgress';
import './SpeechCarousel.css';

interface SpeechCarouselProps {
  readonly current: PlayerSpeech;
  readonly control: SegmentControl | null;
}

function CurrentSpeech({ event, currentRef }: {
  readonly event: PlayerSpeech;
  readonly currentRef: RefObject<HTMLParagraphElement | null>;
}) {
  return (
    <article className="speech-turn" data-slot="current" data-seq={event.seq}>
      <p ref={currentRef}><SpeechLine event={event} /></p>
    </article>
  );
}

function SpeechProgress({ control }: { readonly control: SegmentControl | null }) {
  const { progress } = useSegmentState(control);
  return <SubtitleProgress progress={progress} />;
}

export function SpeechCarousel({ current, control }: SpeechCarouselProps) {
  const speaker = seatOf(current.view, current.seat);
  const { trackRef, messageRef, textRef } = useFitSpeech(current);
  return (
    <section className="speech-carousel" aria-label="舞台发言" data-team={speaker?.team}>
      <div className="speech-backdrop" aria-hidden="true">
        {speaker && <PlayerFigure key={speaker.seat} seat={speaker} className="speech-figure" />}
      </div>
      <div className="speech-track" ref={trackRef}>
        <div ref={messageRef} className="speech-messages" role="region" aria-label="当前发言">
          <ol className="speech-history">
            <li className="speech-focus" aria-live="polite" aria-atomic="true">
              <CurrentSpeech key={current.seq} event={current} currentRef={textRef} />
            </li>
          </ol>
        </div>
        <SpeechProgress control={control} />
      </div>
    </section>
  );
}
