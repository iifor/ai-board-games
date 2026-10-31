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
    // 先写状态与播报，再执行淘汰：淘汰会派发触发器，且播报应先于出局事件
    if (outcome.state !== undefined) env.setState(outcome.state);
    for (const draft of outcome.log ?? []) env.log(draft);
    for (const { seat, reason, cause } of outcome.eliminate ?? []) env.eliminate(seat, reason, cause ?? reason);
    return done();
  },
};

export const revealExecutor: PhaseExecutor<RevealPhase<unknown, unknown>> = {
  enter() {},
  step(env, phase) {
    const content = phase.content(env.ctx());
    const data: Record<string, unknown> = { ...content.data };
    if (phase.revealRoles) {
      env.s.rolesRevealed = true;
      data.roles = env.s.seats.map((seat) => ({ seat: seat.seat, role: seat.role, team: seat.team }));
    }
    env.log({ kind: 'revealed', text: content.text, data, channel: phase.channel ?? 'public' });
    return done();
  },
};
