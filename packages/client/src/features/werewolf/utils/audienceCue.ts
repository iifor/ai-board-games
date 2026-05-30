import type { GameEvent } from '../../../types';

interface AudienceCueResolution {
  kind: string;
  text: string;
  display: 'modal' | 'none';
  speech: 'browser' | 'none';
  once: boolean;
}

function resolveAudienceCue(event: GameEvent | null | undefined): AudienceCueResolution | null {
  const cue = event?.audienceCue;
  if (!cue?.kind) return null;
  const text = resolveAudienceCueText(event);
  if (!text) return null;
  return {
    kind: cue.kind,
    text,
    display: cue.display === 'modal' ? 'modal' : 'none',
    speech: cue.speech === 'browser' ? 'browser' : 'none',
    once: Boolean(cue.once)
  };
}

function resolveAudienceCueText(event: GameEvent | null | undefined): string {
  const cue = event?.audienceCue;
  if (!cue) return '';
  const textField = cue.textField || 'text';
  if (textField === 'message') return String(event?.message || '').trim();
  if (textField === 'narration') return String(event?.narration || '').trim();
  // 'text' field: check event.payload.text first, then event.message
  if (textField === 'text') {
    const payloadText = (event?.payload as Record<string, unknown> | undefined)?.text;
    return String(payloadText || event?.message || '').trim();
  }
  return String(event?.text || '').trim();
}

export {
  resolveAudienceCue,
  resolveAudienceCueText
};

export type {
  AudienceCueResolution
};
