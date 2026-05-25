interface SpeechWordBoundary {
  /** Milliseconds from the start of the synthesized audio. */
  offset: number;
  /** Boundary duration in milliseconds. */
  duration: number;
  /** Text emitted by the speech boundary event. */
  text: string;
}

interface SpeechMedia {
  /** Text synthesized for playback. */
  text: string;
  /** Browser-playable audio resource URL. */
  audioUrl: string;
  /** Audio content type. */
  audioMimeType: string;
  /** Azure speech boundaries when available. */
  wordBoundaries: SpeechWordBoundary[] | null;
}

export type { SpeechWordBoundary, SpeechMedia };
