import { speechLineParts, type PlayerSpeech } from '../playback/speechTurns';

export function SpeechLine({ event }: { readonly event: PlayerSpeech }) {
  const { prefix, speaker, body } = speechLineParts(event);
  return <>{prefix}<strong className="speech-author">{speaker}</strong>{body}</>;
}
