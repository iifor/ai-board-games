import { receiveAiReply } from '../ai/pipeline';
import { applyDebugCommand } from '../debug/breakpoints';
import { EngineInputError } from '../errors';
import type { ExecEnv } from './env';
import type { EngineInput } from './types';

export function applyInput(env: ExecEnv, input: EngineInput): void {
  const { s } = env;
  switch (input.kind) {
    case 'start':
      if (s.status !== 'created') throw new EngineInputError('对局已经开始');
      s.status = 'running';
      return;
    case 'ai_result':
    case 'ai_failed':
      if (s.status !== 'waiting_ai') throw new EngineInputError(`当前状态 ${s.status} 不接受 AI 结果`);
      s.status = 'running';
      receiveAiReply(env, input.requestId, input.kind === 'ai_result' ? { output: input.output } : { failed: input.reason });
      return;
    case 'debug':
      applyDebugCommand(env, input.command);
      return;
  }
}
