import type { PlayerSpeech } from '../playback/speechTurns';
import { SpeechLine } from './SpeechLine';

export function SpeechHistory({ events }: { readonly events: readonly PlayerSpeech[] }) {
  if (!events.length) return null;
  return <>{events.map((event) => (
    <li key={event.seq} data-seq={event.seq}>
      <SpeechLine event={event} />
    </li>
  ))}</>;
}
