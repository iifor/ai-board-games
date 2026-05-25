import { getVoicePackage } from '../voices';
import { prepareVoiceAudio } from '../tts';
import { stripSpeechParentheses } from '../../services/text/playableText';
import { getNarration } from './narration';
import type { NarrationEvent } from './narration';
import type { VoicePackage } from '../../types/api';

interface SpeechData {
  text?: string;
  playerId?: number | string;
  fullText?: string;
  thinking?: string;
  reasoning?: string;
  thought?: string;
  [key: string]: unknown;
}

interface TestimonyData {
  text?: string;
  testimony?: string;
  playerId?: number | string;
  fullText?: string;
  thinking?: string;
  reasoning?: string;
  thought?: string;
  [key: string]: unknown;
}

interface GamePlayer {
  id?: number | string;
  voicePackageId?: number | string | null;
  [key: string]: unknown;
}

interface GameHost {
  voicePackageId?: number | string | null;
  [key: string]: unknown;
}

interface GameData {
  id?: string;
  players?: GamePlayer[];
  host?: GameHost;
  [key: string]: unknown;
}

interface MediaEvent extends NarrationEvent {
  audioUrl?: string;
  audioMimeType?: string;
  audioCached?: boolean;
  wordBoundaries?: unknown[] | null;
  mediaError?: string;
  subtitle?: SubtitleData | null;
}

interface SubtitleData {
  text: string;
  playerId: number | string | null;
  speakerRole: string;
  speakerLabel: string;
}

interface PreparedAudioResult {
  audioUrl: string;
  audioMimeType: string;
  audioCached: boolean;
  wordBoundaries?: unknown[] | null;
}

function prepareOutgoingEvent(event: NarrationEvent): Promise<MediaEvent> {
  return prepareEventMedia(withNarration(cloneEvent(event)));
}

function collectPreparedAudioResources(event: MediaEvent, target: Set<string>): void {
  if (event?.audioUrl) target.add(event.audioUrl);
  (event?.audioSegments as Array<{ audioUrl?: string }> | undefined || []).forEach((segment) => {
    if (segment?.audioUrl) target.add(segment.audioUrl);
  });
}

function cloneEvent(event: NarrationEvent): NarrationEvent {
  return JSON.parse(JSON.stringify(event || {}));
}

function withNarration(event: NarrationEvent): NarrationEvent {
  return { ...event, narration: getNarration(event) };
}

async function prepareEventMedia(event: NarrationEvent): Promise<MediaEvent> {
  const text = getPlayableEventText(event);
  const subtitle: SubtitleData | null = text
    ? {
        text,
        playerId: event.speech?.playerId || event.testimony?.playerId || null,
        speakerRole: getEventSpeakerRole(event, text),
        speakerLabel: getEventSpeakerLabel(event, text),
      }
    : null;
  const result: MediaEvent = subtitle
    ? { ...withPlayableDetails(event, text), subtitle }
    : withPlayableDetails(event, text);
  if (!text) return result;

  const voice = resolveEventVoice(event);
  if (!voice || !voice.enabled || String(voice.provider || '').toLowerCase() !== 'azure')
    return result;

  try {
    const speechText = stripSpeechParentheses(text);
    if (!speechText) return result;
    const saved = await prepareVoiceAudio(voice, speechText, (event.game?.id as string) ?? null);
    if (!saved) return result;
    return {
      ...result,
      audioUrl: saved.audioUrl,
      audioMimeType: saved.audioMimeType,
      audioCached: saved.audioCached,
      wordBoundaries: saved.wordBoundaries || null,
    };
  } catch (error) {
    return { ...result, mediaError: (error as Error).message };
  }
}

function getEventSpeakerRole(event: NarrationEvent, text = ''): string {
  if (event.speech?.playerId || event.testimony?.playerId) return 'player';
  if (event.type === 'done') return 'system';
  if (/^游戏开始/.test(String(text || event.message || event.narration || '').trim()))
    return 'system';
  if (/^游戏结束/.test(String(text || event.message || event.narration || '').trim()))
    return 'system';
  return 'host';
}

function getEventSpeakerLabel(event: NarrationEvent, text = ''): string {
  const role = getEventSpeakerRole(event, text);
  if (role === 'system') return '系统播报';
  if (role === 'host') return '主持人';
  return '';
}

function getPlayableEventText(event: NarrationEvent): string {
  if (event.speech?.text) return String(event.speech.text).trim();
  if (event.testimony?.text) return String(event.testimony.text).trim();
  if (event.testimony?.testimony) return String(event.testimony.testimony).trim();
  return String(event.narration || event.message || '').trim();
}

function withPlayableDetails(event: NarrationEvent, fullText: string): MediaEvent {
  if (event.speech) {
    return {
      ...event,
      speech: {
        ...event.speech,
        fullText: event.speech.fullText || fullText || event.speech.text || '',
        thinking:
          event.speech.thinking || event.speech.reasoning || event.speech.thought || '',
      },
    };
  }
  if (event.testimony) {
    return {
      ...event,
      testimony: {
        ...event.testimony,
        fullText:
          event.testimony.fullText ||
          fullText ||
          event.testimony.text ||
          event.testimony.testimony ||
          '',
        thinking:
          event.testimony.thinking ||
          event.testimony.reasoning ||
          event.testimony.thought ||
          '',
      },
    };
  }
  return event as MediaEvent;
}

function resolveEventVoice(event: NarrationEvent): VoicePackage | null {
  const playerId = event.speech?.playerId || event.testimony?.playerId;
  if (playerId) {
    const player = event.game?.players?.find(
      (item) => Number(item.id) === Number(playerId),
    );
    if (player?.voicePackageId) return getVoicePackage(player.voicePackageId as string | number);
  }
  if (event.game?.host?.voicePackageId) return getVoicePackage(event.game.host.voicePackageId as string | number);
  return null;
}

export {
  prepareOutgoingEvent,
  collectPreparedAudioResources,
  cloneEvent,
  withNarration,
  prepareEventMedia,
  getEventSpeakerRole,
  getEventSpeakerLabel,
  getPlayableEventText,
  withPlayableDetails,
  resolveEventVoice,
};
export type { MediaEvent };
