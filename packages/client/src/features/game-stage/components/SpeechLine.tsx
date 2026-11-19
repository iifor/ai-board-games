import { speechLineParts, type PlayerSpeech } from '../playback/speechTurns';

export function SpeechLine({ event, compactParagraphs = false }: { readonly event: PlayerSpeech; readonly compactParagraphs?: boolean }) {
  const { prefix, speaker, body } = speechLineParts(event);
  const [first = '', ...rest] = compactParagraphs ? body.split(/\n\s*\n+/) : [body];
  return <>{prefix}<strong className="speech-author">{speaker}</strong>{first}
    {rest.map((paragraph,index) => <span className="speech-paragraph" key={index}>{paragraph}</span>)}</>;
}
