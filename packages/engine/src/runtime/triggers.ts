import type { TriggerEvent } from '../spec/context';
import type { ExecEnv } from './env';

/** 派发事件：按 spec 声明顺序匹配触发器；push 排队等待当前阶段结束，jump 只保留第一个 */
export function fireEvent(env: ExecEnv, event: TriggerEvent): void {
  const { s } = env;
  if (s.gameOverTriggered) return;
  const ctx = env.ctx();
  for (const trigger of env.game.spec.triggers ?? []) {
    if (trigger.on !== event.kind || (trigger.when && !trigger.when(ctx, event))) continue;
    if (trigger.push) {
      s.triggerQueue.push({ phaseId: trigger.push, event });
    } else if (trigger.jump && !s.jump) {
      s.jump = { phaseId: trigger.jump, round: trigger.round === 'increment', event };
    }
  }
}
