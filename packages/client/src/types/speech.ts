import type { SpeechWordBoundary, SpeechMedia } from '@ai-presenter/shared/types/speechTypes';

export type { SpeechWordBoundary, SpeechMedia };

export interface VoiceProfile {
  role: 'host' | 'child' | 'male' | 'female';
  rate: number;
  pitch: number;
  volume: number;
}

export interface SpeechState {
  id: string;
  playerId: string | null;
  text: string;
  wordBoundaries: SpeechWordBoundary[] | null;
  currentTimeMs: number | null;
  speakerLabel?: string;
  speakerRole?: string;
  fullText?: string;
  thinking?: string;
  [key: string]: unknown;
}

export interface QueueItem {
  text: string;
  onEnd?: () => void;
  playerId?: string;
  voicePackageId?: number | null;
  audioUrl?: string | null;
  audioMimeType?: string | null;
  wordBoundaries?: SpeechWordBoundary[] | null;
  volume?: number;
  onStart?: (media?: SpeechMedia) => void;
  onTimeChange?: (currentTimeMs: number | null) => void;
}

export interface NormalizedWord {
  index: number;
  text: string;
  startMs: number;
  endMs: number;
}

export interface SubtitleCue {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  words: NormalizedWord[];
}

export interface SubtitleTimeline {
  fullText: string;
  cues: SubtitleCue[];
}

export type WordPlaybackState = 'punctuation' | 'upcoming' | 'active' | 'past';

export interface PlayableTextSegment {
  index: number;
  displayText: string;
  text: string;
  speechText: string;
}

export interface PlayableTextOptions {
  maxChars?: number;
}
