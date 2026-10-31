import type { CompiledGame } from '../compiler/compile';
import type { EngineSnapshot, Seat } from '../runtime/types';
import { audienceMode } from '../visibility/audienceView';
import { entryVisibleTo } from '../visibility/channels';
import { roleVisibleTo } from '../visibility/roles';
import { projectState } from '../visibility/stateProjection';
import { runToEnd, type RunOptions, type RunRecord } from './harness';

/** 太短的字符串（如"是""2号"）容易在合法内容中偶然出现，不参与泄露比对 */
const MIN_SECRET_LENGTH = 4;

function collectStrings(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    if (value.length >= MIN_SECRET_LENGTH) into.add(value);
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, into);
  }
  return into;
}

function entryStrings(entry: EngineSnapshot['log'][number], into: Set<string>): void {
  if (entry.kind === 'speech' || entry.kind === 'narration' || entry.kind === 'action' || entry.kind === 'revealed') {
    collectStrings(entry.text, into);
  } else if (entry.kind === 'judgement') {
    collectStrings(entry.comment, into);
  }
}

/** viewer 看不到、且没有以同样文本出现在其可见内容中的字符串 */
function hiddenStrings(game: CompiledGame, snapshot: EngineSnapshot, viewer: Seat | null): Set<string> {
  const hidden = new Set<string>();
  const visible = collectStrings(projectState(game, snapshot.state, viewer));
  for (const entry of snapshot.log) {
    const canSee = viewer ? entryVisibleTo(entry, viewer) : entry.channel === 'public';
    entryStrings(entry, canSee ? visible : hidden);
  }
  collectStrings(snapshot.state, hidden);
  for (const text of visible) hidden.delete(text);
  return hidden;
}

export function assertTerminates(game: CompiledGame, seeds: readonly number[], options: Omit<RunOptions, 'seed'> = {}): RunRecord[] {
  return seeds.map((seed) => {
    const run = runToEnd(game, { ...options, seed });
    if (run.snapshot.status !== 'completed' || !run.snapshot.result) throw new Error(`种子 ${seed} 没有正常终局`);
    return run;
  });
}

export function assertDeterministic(game: CompiledGame, options: RunOptions): void {
  const fingerprint = (run: RunRecord): string => JSON.stringify({
    log: run.log,
    result: run.snapshot.result,
    prompts: run.requests.map(({ request }) => request.prompt),
  });
  if (fingerprint(runToEnd(game, options)) !== fingerprint(runToEnd(game, options))) {
    throw new Error(`种子 ${options.seed} 两次运行结果不一致`);
  }
}

/** 事件发生时身份是否已被 revealRoles 公开（揭示事件会携带 data.roles） */
function eventRevealed(run: RunRecord, seq: number): boolean {
  return run.log.some((entry) => entry.kind === 'revealed' && entry.seq <= seq && 'roles' in entry.data);
}

/** 每个 AI 请求都不含其不可见的内容；公开视角的舞台事件只来自公开频道且不暴露隐藏身份 */
export function assertNoLeak(game: CompiledGame, run: RunRecord): void {
  const problems: string[] = [];
  for (const { request, snapshot } of run.requests) {
    const viewer = snapshot.seats.find((seat) => seat.seat === request.seat);
    if (!viewer) throw new Error(`请求 ${request.id} 的座位不存在`);
    const prompt = Object.values(request.prompt).join('\n');
    for (const secret of hiddenStrings(game, snapshot, viewer)) {
      if (prompt.includes(secret)) problems.push(`请求 ${request.id}（${request.seat}号）泄露了"${secret}"`);
    }
  }

  if (audienceMode(game) === 'public') {
    const secrets = hiddenStrings(game, run.snapshot, null);
    for (const event of run.stageEvents) {
      if (event.channel !== 'public') problems.push(`舞台事件 #${event.seq} 来自非公开频道 ${event.channel}`);
      for (const text of collectStrings(event.view.extra)) {
        if (secrets.has(text)) problems.push(`舞台事件 #${event.seq} 的 view.extra 泄露了"${text}"`);
      }
      if (event.view.status === 'completed') continue;
      for (const seat of event.view.seats) {
        const actual = run.snapshot.seats.find((item) => item.seat === seat.seat);
        const unrevealed = { ...run.snapshot, rolesRevealed: false };
        if (actual && seat.role !== null && !roleVisibleTo(game, unrevealed, actual, null) && !eventRevealed(run, event.seq)) {
          problems.push(`舞台事件 #${event.seq} 暴露了 ${seat.seat}号的身份`);
        }
      }
    }
  }
  if (problems.length) throw new Error(`信息泄露：\n- ${problems.slice(0, 20).join('\n- ')}`);
}
