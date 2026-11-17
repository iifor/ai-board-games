import type { TriggerEvent } from '../spec/context';
import { deepFreeze } from '../utils/json';
import type { ExecEnv } from './env';

/**
 * 派发事件：按 spec 声明顺序匹配触发器；push 排队等待当前阶段结束，jump 只保留第一个。
 * 带 unlessGameOver 的触发器在事件发生时胜负已分则跳过（胜负按需计算，最多一次）。
 */
export function fireEvent(env: ExecEnv, event: TriggerEvent): void {
  const { s } = env;
  if (s.gameOverTriggered) return;
  const ctx = env.ctx();
  const gameOver = env.game.spec.gameOver;
  let decided: boolean | undefined;
  const isDecided = () => (decided ??= gameOver?.when(ctx) ?? false);
  for (const trigger of env.game.spec.triggers ?? []) {
    if (trigger.on !== event.kind || (trigger.when && !trigger.when(ctx, event))) continue;
    if (trigger.unlessGameOver && isDecided()) continue;
    if (trigger.push) {
      s.triggerQueue.push(deepFreeze({ phaseId: trigger.push, event }));
    } else if (trigger.jump && !s.jump) {
      s.jump = { phaseId: trigger.jump, round: trigger.round === 'increment', event };
    }
  }
}
