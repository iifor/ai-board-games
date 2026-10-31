import type { StageEvent } from '@battle/shared';
import type { CompiledGame } from '../compiler/compile';
import { scriptedOutput } from '../debug/scriptedAgent';
import { advance } from '../runtime/advance';
import { createSnapshot } from '../runtime/setup';
import type {
  AdvanceResult,
  AiRequest,
  CreateMatchInput,
  DebugCommand,
  EngineInput,
  EngineSnapshot,
  LogEntry,
  SeatProfile,
} from '../runtime/types';

export type AgentReply = { readonly output: unknown } | { readonly failed: string };
export type Agent = (request: AiRequest, snapshot: EngineSnapshot) => AgentReply;

export interface RecordedRequest {
  readonly request: AiRequest;
  /** 发出该请求的那次推进结束后的快照 */
  readonly snapshot: EngineSnapshot;
}

export interface RunRecord {
  readonly snapshot: EngineSnapshot;
  readonly log: readonly LogEntry[];
  readonly stageEvents: readonly StageEvent[];
  readonly requests: readonly RecordedRequest[];
  readonly advances: number;
}

export interface RunOptions {
  readonly seed: number;
  readonly players?: readonly SeatProfile[];
  /** 未提供 players 时生成的人数，默认 players.max */
  readonly playerCount?: number;
  readonly params?: unknown;
  readonly variant?: string;
  readonly agent?: Agent;
  readonly debug?: CreateMatchInput['debug'];
  /** 调试局暂停时自动下达的指令，默认 continue */
  readonly onPause?: DebugCommand;
  readonly maxAdvances?: number;
}

export function makePlayers(count: number): SeatProfile[] {
  return Array.from({ length: count }, (_, index) => ({
    playerId: `p${index + 1}`,
    name: `玩家${index + 1}`,
    persona: '',
    avatar: null,
  }));
}

export function scriptedAgent(game: CompiledGame): Agent {
  return (request, snapshot) => ({ output: scriptedOutput(game, snapshot, request) });
}

/** 在内存中把一局跑到终局，按发出顺序逐个回答 AI 请求 */
export function runToEnd(game: CompiledGame, options: RunOptions): RunRecord {
  const players = options.players ?? makePlayers(options.playerCount ?? game.spec.players.max);
  const agent = options.agent ?? scriptedAgent(game);
  const maxAdvances = options.maxAdvances ?? 5000;
  const log: LogEntry[] = [];
  const stageEvents: StageEvent[] = [];
  const requests: RecordedRequest[] = [];
  const queue: AiRequest[] = [];
  let snapshot = createSnapshot(game, {
    seed: options.seed,
    players,
    params: options.params,
    ...(options.variant ? { variant: options.variant } : {}),
    ...(options.debug ? { debug: options.debug } : {}),
  });
  let advances = 0;

  const step = (input: EngineInput): AdvanceResult => {
    advances += 1;
    if (advances > maxAdvances) throw new Error(`种子 ${options.seed} 在 ${maxAdvances} 次推进内没有结束`);
    const result = advance(game, snapshot, input);
    snapshot = result.snapshot;
    log.push(...result.log);
    stageEvents.push(...result.stageEvents);
    for (const request of result.aiRequests) {
      queue.push(request);
      requests.push({ request, snapshot });
    }
    return result;
  };

  let result = step({ kind: 'start' });
  while (result.status !== 'completed') {
    if (result.status === 'paused') {
      result = step({ kind: 'debug', command: options.onPause ?? 'continue' });
    } else if (result.status === 'waiting_ai') {
      const request = queue.shift();
      if (!request) throw new Error('引擎在等待 AI，但没有未回答的请求');
      const reply = agent(request, snapshot);
      result = step('output' in reply
        ? { kind: 'ai_result', requestId: request.id, output: reply.output }
        : { kind: 'ai_failed', requestId: request.id, reason: reply.failed });
    } else {
      throw new Error(`意外的引擎状态：${result.status}`);
    }
  }
  return { snapshot, log, stageEvents, requests, advances };
}
