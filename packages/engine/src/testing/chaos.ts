import type { CompiledGame } from '../compiler/compile';
import { chaosReply } from '../debug/chaosAgent';
import type { Agent } from './harness';

export { CHAOS_FAILURE_REASON, CHAOS_RATES, chaosReply } from '../debug/chaosAgent';

/** 混沌模式代理：性质测试用，逻辑在 debug/chaosAgent.ts（服务端的混沌调试局也用它） */
export function chaosAgent(game: CompiledGame): Agent {
  return (request, snapshot) => chaosReply(game, snapshot, request);
}
