import { undercoverSpeechSchema, undercoverVoteSchema } from '../../../shared/schemas/undercover';
import { seededIndex, validatePublicSpeech } from './rules';
import type { UndercoverState } from './types';

const DEBUG_SPEECH_TEMPLATES = [
  '它在日常生活里很常见，但不同场景下体验差异很大。',
  '多数人接触过它，不过使用习惯往往不完全相同。',
  '它通常容易辨认，但只看一个特点也可能判断错误。',
] as const;

function buildUndercoverDebugSpeech(state: UndercoverState, actorId: number): { speech: string } {
  const index = seededIndex(
    state.seed,
    DEBUG_SPEECH_TEMPLATES.length,
    Math.imul(state.round, 31) ^ Math.imul(actorId, 131),
  );
  const candidate = DEBUG_SPEECH_TEMPLATES[index];
  const validated = validatePublicSpeech(candidate, state.wordPair);
  const speech = validated.ok ? validated.text : '这个事物在生活中并不少见';
  const finalSpeech = validatePublicSpeech(speech, state.wordPair);
  if (!finalSpeech.ok) throw new Error('Undercover debug cannot produce public speech');
  return undercoverSpeechSchema.parse({
    speech: finalSpeech.text,
  });
}

function buildUndercoverDebugVote(
  state: UndercoverState,
  actorId: number,
  legalIds: number[],
  runoff: boolean,
): { targetId: number; reason: string } {
  if (!legalIds.length) throw new Error(`Undercover debug voter ${actorId} has no legal targets`);
  const index = seededIndex(
    state.seed,
    legalIds.length,
    Math.imul(state.round, 31) ^ Math.imul(actorId, 131) ^ (runoff ? 1 : 0),
  );
  return undercoverVoteSchema.parse({ targetId: legalIds[index], reason: '' });
}

export { buildUndercoverDebugSpeech, buildUndercoverDebugVote };
