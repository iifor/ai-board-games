import { renderTemplate } from '../prompt/template';
import { buildPublicContext } from '../prompt/visibleContext';
import type { AnnouncePhase, ComputePhase, RevealPhase } from '../spec/phases';
import { done, type PhaseExecutor } from './types';

// 不需要 AI 的三种动作：进入即完成。

export const announceExecutor: PhaseExecutor<AnnouncePhase<unknown, unknown>> = {
  enter() {},
  step(env, phase) {
    const text = renderTemplate(phase.text, buildPublicContext(env.game, env.s));
    env.log({ kind: 'narration', text, channel: phase.channel ?? 'public' });
    return done();
  },
};

export const computeExecutor: PhaseExecutor<ComputePhase<unknown, unknown>> = {
  enter() {},
  step(env, phase) {
    const outcome = phase.run(env.ctx());
    if (outcome.state !== undefined) env.setState(outcome.state);
    for (const { seat, reason } of outcome.eliminate ?? []) env.eliminate(seat, reason);
    for (const draft of outcome.log ?? []) env.log(draft);
    return done();
  },
};

export const revealExecutor: PhaseExecutor<RevealPhase<unknown, unknown>> = {
  enter() {},
  step(env, phase) {
    const content = phase.content(env.ctx());
    env.log({ kind: 'revealed', text: content.text, data: content.data ?? {}, channel: phase.channel ?? 'public' });
    return done();
  },
};
