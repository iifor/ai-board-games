export const PLAYBACK_PROTOCOL_VERSION = 1;

export interface PlaybackMediaReference {
  url: string;
  mimeType?: string;
}

export interface PlaybackEvent {
  protocolVersion: number;
  sequence: number;
  eventType: string;
  viewMode: string;
  payload: Record<string, unknown>;
  media: PlaybackMediaReference[];
}

export interface PlaybackEventSource<T = PlaybackEvent> {
  events(): AsyncIterable<T>;
}
