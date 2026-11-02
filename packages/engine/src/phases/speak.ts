import { applyDeclaration, speakSchema } from '../ai/declarations';
import type { ExecEnv } from '../runtime/env';
import { toSeatNumbers, type SeatSelection } from '../runtime/seats';
import type { TemplateVars } from '../runtime/types';
import { DEFAULT_SPEECH_MAX_CHARS, speechMaxOf } from '../spec/define';
import type { SpeakPhase, SpeakTurn, SpeechOutput } from '../spec/phases';
import { done, issue, templateByName, withMaxChars, type AiPhaseExecutor, type RequestDraft } from './types';

interface TurnState {
  readonly seat: number;
  readonly vars: TemplateVars;
  readonly template: string;
}

interface SpeakState {
  readonly turns: TurnState[];
  next: number;
  issued: boolean;
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
    const turn = state.turns[state.next];
    if (!turn) return result();
    state.issued = true;
    return issue([draft(env, turn, state.next)]);
  },

  schema(env, phase, pending) {
    return speakSchema(env, phase, env.seat(pending.seat));
  },

  check(env, phase, pending, value) {
    return phase.validate?.(value as SpeechOutput, env.ctx(), env.seat(pending.seat)) ?? null;
  },

  fallback(env, phase, pending) {
    return phase.fallback(env.ctx(), env.seat(pending.seat));
  },

  store(env, phase, pending, value) {
    const state = env.phaseState<SpeakState>();
    const seat = env.seat(pending.seat);
    const text = (value as SpeechOutput).speech;
    env.log({ kind: 'speech', seat: seat.seat, text, channel: phase.channel?.(env.ctx(), seat) ?? 'public' });
    state.speeches.push({ seat: seat.seat, text });
    if (phase.mode !== 'parallel' && turnIndex(pending.slot) === state.next) {
      state.next += 1;
      state.issued = false;
    }
    applyDeclaration(env, phase, seat, value);
  },
};
