export interface VoiceControlSupport {
  readonly pause: boolean;
  readonly rate: boolean;
  readonly pitch: boolean;
}

export type SpeechControl =
  | { readonly kind: 'pause'; readonly ms: number }
  | { readonly kind: 'rate' | 'pitch'; readonly offset: number }
  | { readonly kind: 'reset' };

export const SPEECH_CONTROLS: Readonly<Record<string, SpeechControl>> = {
  短停: { kind: 'pause', ms: 250 }, 停顿: { kind: 'pause', ms: 500 }, 长停: { kind: 'pause', ms: 900 },
  放慢: { kind: 'rate', offset: -15 }, 加快: { kind: 'rate', offset: 15 }, 恢复语速: { kind: 'rate', offset: 0 },
  抬高音调: { kind: 'pitch', offset: 10 }, 压低音调: { kind: 'pitch', offset: -10 }, 恢复音调: { kind: 'pitch', offset: 0 },
  恢复: { kind: 'reset' },
};

export function speechControl(label: string): SpeechControl | undefined {
  return Object.hasOwn(SPEECH_CONTROLS, label) ? SPEECH_CONTROLS[label] : undefined;
}

export function controlTags(support: VoiceControlSupport): string[] {
  return Object.entries(SPEECH_CONTROLS).filter(([, value]) => {
    if (value.kind === 'reset') return support.rate || support.pitch;
    return support[value.kind];
  }).map(([label]) => label);
}
