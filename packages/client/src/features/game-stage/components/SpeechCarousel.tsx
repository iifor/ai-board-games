import { useSegmentState } from '../hooks/useSegmentState';
import type { RefObject } from 'react';
import { useSpeechScroll } from '../hooks/useSpeechScroll';
import { seatOf } from '../utils';
import type { SegmentControl } from '../playback/segment';
import type { PlayerSpeech } from '../playback/speechTurns';
import { PlayerFigure } from './PlayerFigure';
import { SpeechHistory } from './SpeechHistory';
import { SpeechLine } from './SpeechLine';
import { SubtitleProgress } from './SubtitleProgress';
import './SpeechCarousel.css';

interface SpeechCarouselProps {
  readonly current: PlayerSpeech;
  readonly history: readonly PlayerSpeech[];
  readonly control: SegmentControl | null;
}

function CurrentSpeech({ event, currentRef }: {
  readonly event: PlayerSpeech;
  readonly currentRef: RefObject<HTMLElement | null>;
}) {
  return (
    <article ref={currentRef} className="speech-turn" data-slot="current" data-seq={event.seq}>
      <p><SpeechLine event={event} /></p>
    </article>
  );
}

function SpeechProgress({ control }: { readonly control: SegmentControl | null }) {
  const { progress } = useSegmentState(control);
  return <SubtitleProgress progress={progress} />;
}

export function SpeechCarousel({ current, history, control }: SpeechCarouselProps) {
  const speaker = seatOf(current.view, current.seat);
  const { scrollRef, currentRef, readManually } = useSpeechScroll(control, current.seq);
  return (
    <section className="speech-carousel" aria-label="舞台发言" data-team={speaker?.team}>
      <div className="speech-backdrop" aria-hidden="true">
        {speaker && <PlayerFigure key={speaker.seat} seat={speaker} className="speech-figure" />}
      </div>
      <div className="speech-track">
        <div ref={scrollRef} className="speech-messages" role="region" aria-label="发言记录" tabIndex={0}
          onWheel={readManually} onTouchStart={readManually} onPointerDown={readManually}
          onKeyDown={(event) => {
            if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) readManually();
          }}>
          <ol className="speech-history">
            <SpeechHistory events={history} />
            <li className="speech-focus" aria-live="polite" aria-atomic="true">
              <CurrentSpeech key={current.seq} event={current} currentRef={currentRef} />
            </li>
          </ol>
        </div>
        <SpeechProgress control={control} />
      </div>
    </section>
  );
}
