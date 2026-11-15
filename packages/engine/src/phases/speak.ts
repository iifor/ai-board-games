import { applyDeclaration, speakSchema } from '../ai/declarations';
import type { ExecEnv } from '../runtime/env';
import { toSeatNumbers, type SeatSelection } from '../runtime/seats';
import { replySeats, scheduleReplies, withReplyRequests, type ReplyOutput, type TurnState } from './speakReplies';
import { DEFAULT_SPEECH_MAX_CHARS, speechMaxOf } from '../spec/define';
import type { SpeakPhase, SpeakTurn, SpeechOutput } from '../spec/phases';
import { done, issue, templateByName, withMaxChars, type AiPhaseExecutor, type RequestDraft } from './types';
import { listenerDrafts, listenerSchema } from './listenerDecisions';

interface SpeakState {
  readonly turns: TurnState[];
  next: number;
  issued: boolean;
  listenerBoundary?: number;
  declaration?: { seat: number; declare: string };
  readonly speeches: { seat: number; text: string }[];
}

type Phase = SpeakPhase<unknown, unknown>;

function isSpeakTurn(item: unknown): item is SpeakTurn {
  return typeof item === 'object' && item !== null && 'seat' in item && !('profile' in item);
}

/** 提示词告诉模型的目标字数：speechOutput({ max }) 登记的值；自定义 output schema 用默认值 */
function speechMaxChars(phase: Phase): number {
  return speechMaxOf(phase.output) ?? DEFAULT_SPEECH_MAX_CHARS;
}

function normalizeTurns(phase: Phase, selection: SeatSelection | readonly SpeakTurn[]): TurnState[] {
  const maxChars = speechMaxChars(phase);
  if (Array.isArray(selection) && selection.some(isSpeakTurn)) {
    return (selection as readonly SpeakTurn[]).map((turn) => ({
      seat: typeof turn.seat === 'number' ? turn.seat : turn.seat.seat,
      vars: withMaxChars(turn.vars ?? {}, maxChars),
      template: (turn.prompt ?? phase.prompt).name,
    }));
  }
  const vars = withMaxChars({}, maxChars);
  return toSeatNumbers(selection as SeatSelection).map((seat) => ({ seat, vars, template: phase.prompt.name }));
}

function draft(env: ExecEnv, turn: TurnState, index: number): RequestDraft {
  return {
    slot: `t${index}`,
    seat: turn.seat,
    action: 'speak',
    template: templateByName(env, turn.template),
    vars: turn.vars,
    legalTargets: null,
  };
}

function turnIndex(slot: string): number {
  return Number(slot.slice(1));
}

export const speakExecutor: AiPhaseExecutor<Phase> = {
  enter(env, phase) {
    const turns = normalizeTurns(phase, phase.actors(env.ctx()));
    env.setPhaseState<SpeakState>({ turns, next: 0, issued: false, speeches: [] });
  },

  step(env, phase) {
    const state = env.phaseState<SpeakState>();
    const result = () => done({ kind: 'speak', speeches: state.speeches });
    if (phase.mode === 'parallel') {
      if (state.issued || state.turns.length === 0) return result();
      state.issued = true;
      return issue(state.turns.map((turn, index) => draft(env, turn, index)));
    }
    if (state.declaration) {
      applyDeclaration(env, phase, env.seat(state.declaration.seat), state.declaration);
      delete state.declaration;
      if (env.s.jump) return result();
    }
    const speaker = state.turns[Math.max(0, state.next - 1)];
    if (speaker && phase.declarations && state.listenerBoundary !== state.next) {
      state.listenerBoundary = state.next;
      const drafts = listenerDrafts(env, phase, speaker.seat, state.next);
      if (drafts.length) return issue(drafts);
    }
    const turn = state.turns[state.next];
    if (!turn) return result();
    state.issued = true;
    return issue([draft(env, turn, state.next)]);
  },

  schema(env, phase, pending) {
    if (pending.action === 'act') return listenerSchema(pending.seat);
    const schema = speakSchema(env, phase, env.seat(pending.seat));
    if (!phase.followUp) return schema;
    const { turns } = env.phaseState<SpeakState>();
    return withReplyRequests(schema, replySeats(env, phase, turns, turnIndex(pending.slot)));
  },

  check(env, phase, pending, value) {
    if (pending.action === 'act') return null;
    if (phase.allowSkip && (value as { speech: string | null }).speech === null) {
      return (value as { declare?: string }).declare === undefined ? null : '跳过发言时不能同时声明动作';
    }
    return phase.validate?.(value as SpeechOutput, env.ctx(), env.seat(pending.seat)) ?? null;
  },

  skipFailed(env, phase, pending) {
    if (pending.action === 'act') return { skipped: true, targets: [] };
    const pass = { speech: '过~' };
    speakExecutor.store(env, phase, pending, pass);
    return pass;
  },

  store(env, phase, pending, value) {
    const state = env.phaseState<SpeakState>();
    if (pending.action === 'act') {
      // 同一批请求的模型可能乱序返回；同时声明时按座号裁决。
      if ((value as { targets: number[] }).targets.length && (!state.declaration || pending.seat < state.declaration.seat)) {
        state.declaration = { seat: pending.seat, declare: String(pending.vars.declaration) };
      }
      return;
    }
    const seat = env.seat(pending.seat);
    if (phase.mode !== 'parallel' && turnIndex(pending.slot) === state.next) {
      state.next += 1;
      state.issued = false;
    }
    const text = (value as { speech: string | null }).speech;
    if (text === null) return;
    const requests = (value as ReplyOutput).replyRequests;
    const index = turnIndex(pending.slot);
    const replyRequests = phase.followUp && requests?.length
      ? scheduleReplies(state.turns, index, phase.followUp.prompt.name, replySeats(env, phase, state.turns, index), requests)
      : [];
    env.log({ kind: 'speech', seat: seat.seat, text, channel: phase.channel?.(env.ctx(), seat) ?? 'public',
      ...(replyRequests.length && { replyRequests }) });
    state.speeches.push({ seat: seat.seat, text });
    applyDeclaration(env, phase, seat, value);
  },
};
