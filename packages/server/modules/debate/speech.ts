import { getDebateRoleName } from './prompts';
import { cleanText } from './utils';
import type { DebatePlayer, SpeechEntry, DebatePhase } from './utils';

interface SpeechSource {
  id: string;
  name: string;
  limit: number;
}

interface SpeechResult {
  content: string;
  thinking?: string;
}

interface EmitContext {
  emit: (event: Record<string, unknown>) => Promise<void> | void;
  serialize: (patch?: Record<string, unknown>) => Record<string, unknown>;
}

function createPhase(source: SpeechSource): DebatePhase {
  return { ...source, speeches: [], votes: [], summary: '', stageSummary: '' };
}

function pushSpeech(
  phase: DebatePhase,
  agent: DebatePlayer,
  text: string,
  kind: string = 'speech',
  targetId: number | null = null,
): SpeechEntry {
  const item: SpeechEntry = {
    phaseId: phase.id,
    kind,
    playerId: agent.id,
    side: agent.side,
    debateRole: agent.debateRole,
    speakerLabel: getDebateRoleName(agent),
    text,
    targetId,
  };
  phase.speeches.push(item);
  agent.speeches = agent.speeches || [];
  agent.speeches.push(item);
  return item;
}

async function emitSpeech(
  ctx: EmitContext,
  phase: DebatePhase,
  agent: DebatePlayer,
  result: string | SpeechResult,
  kind: string,
  targetId: number | null = null,
): Promise<SpeechEntry> {
  const text = typeof result === 'string' ? result : result.content;
  const thinking = typeof result === 'string' ? '' : (result.thinking || '');
  if (thinking) await ctx.emit({ type: 'thinking', playerId: agent.id, thinking });
  const speech = pushSpeech(phase, agent, text, kind, targetId);
  if (thinking) speech.thinking = thinking;
  await ctx.emit({ type: 'speech', phase, speech, game: ctx.serialize() });
  return speech;
}

function summarizeDebatePhase(phase: DebatePhase): string {
  const texts = (phase.speeches || [])
    .map((speech) => `${speech.speakerLabel || '发言'}：${cleanText(speech.text)}`)
    .filter(Boolean);
  if (!texts.length) return cleanText(phase.summary).slice(0, 120);
  return texts.join('；').slice(0, 260);
}

export { createPhase, pushSpeech, emitSpeech, summarizeDebatePhase };
export type { SpeechSource, SpeechResult, EmitContext };
