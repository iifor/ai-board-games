/**
 * Skill 事件上下文构建器
 * 从 Runtime 中提取 SkillEventEmitter 所需的信息
 */

import type { SkillEventContext } from '../agent-core/skillEventEmitter';

interface RuntimeLike {
  ctx?: { state?: { gameId?: string } };
  state?: {
    rounds?: Array<{ day?: number; phase?: string }>;
    currentActionWindow?: { phase?: string } | null;
    currentStep?: string;
  };
}

/**
 * 从 Runtime 提取 Skill 事件上下文
 */
export function createSkillContext(
  runtime: RuntimeLike,
  skillId: string,
  actorId: number,
): SkillEventContext {
  const activeRound = (runtime.state?.rounds || [])[
    (runtime.state?.rounds || []).length - 1
  ];
  const phase =
    (runtime.state?.currentActionWindow as { phase?: string } | null)?.phase ||
    (activeRound as { phase?: string } | undefined)?.phase ||
    'night';

  return {
    skillId,
    actorId,
    phase,
    matchId: runtime.ctx?.state?.gameId || '',
    stepId: runtime.state?.currentStep as string | undefined,
    day: (activeRound as { day?: number } | undefined)?.day,
  };
}
