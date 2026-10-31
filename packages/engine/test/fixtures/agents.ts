import type { AiRequest, CompiledGame, EngineSnapshot } from '../../src';
import { scriptedAgent, type Agent, type AgentReply } from '../../src/testing';

/** 默认用脚本化输出，命中的请求改用自定义回复 */
export function agentWith(
  game: CompiledGame,
  override: (request: AiRequest, snapshot: EngineSnapshot) => AgentReply | undefined,
): Agent {
  const fallback = scriptedAgent(game);
  return (request, snapshot) => override(request, snapshot) ?? fallback(request, snapshot);
}
