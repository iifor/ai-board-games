import { createSnapshot, type AiRequest, type EngineSnapshot, type LogEntry, type Seat } from '@battle/engine';
import { makePlayers, runToEnd, type Agent, type RunRecord } from '@battle/engine/testing';
import { werewolfGame } from '../../src/werewolf';
import type { WerewolfState } from '../../src/werewolf';

export type Override = (request: AiRequest, snapshot: EngineSnapshot) => unknown;

/**
 * 被动基线：狼人弃刀、所有投票弃票、可放弃的动作都放弃，对局会一直平安直到天数上限。
 * 测试只覆盖它关心的阶段，结果完全可控。
 */
export function passiveOutput(request: AiRequest): unknown {
  if (request.action === 'speak') return { speech: `${request.seat}号在${request.phaseId}发言` };
  if (request.action === 'vote') return { target: null };
  if (request.action === 'act') {
    const optional = String(request.outputSchema.properties ? JSON.stringify(request.outputSchema.properties) : '').includes('空数组');
    return { targets: optional ? [] : (request.legalTargets ?? []).slice(0, 1) };
  }
  return { verdict: 'pro', comment: '无' };
}

export function play(seed: number, override: Override = () => undefined, variant?: string): RunRecord {
  const agent: Agent = (request, snapshot) => ({ output: override(request, snapshot) ?? passiveOutput(request) });
  return runToEnd(werewolfGame, { seed, agent, maxAdvances: 2000, ...(variant ? { variant } : {}) });
}

export function seatsOf(seed: number, variant?: string): readonly Seat[] {
  return createSnapshot(werewolfGame, { seed, players: makePlayers(12), ...(variant ? { variant } : {}) }).seats;
}

export function roleSeats(seed: number, role: string, variant?: string): number[] {
  return seatsOf(seed, variant).filter((seat) => seat.role === role).map((seat) => seat.seat);
}

export function first(seed: number, role: string, variant?: string): number {
  const [seat] = roleSeats(seed, role, variant);
  if (seat === undefined) throw new Error(`种子 ${seed} 没有 ${role}`);
  return seat;
}

export function stateOf(snapshot: EngineSnapshot): WerewolfState {
  return snapshot.state as WerewolfState;
}

type Of<K extends LogEntry['kind']> = Extract<LogEntry, { kind: K }>;

export function entries<K extends LogEntry['kind']>(run: RunRecord, kind: K, phaseId?: string): Of<K>[] {
  return run.log.filter((entry): entry is Of<K> => entry.kind === kind && (phaseId === undefined || entry.phaseId === phaseId));
}

export function eliminated(run: RunRecord): { seat: number; round: number; reason: string }[] {
  return entries(run, 'seat_eliminated').map((entry) => ({ seat: entry.seat, round: entry.round, reason: entry.reason }));
}

export function requestsIn(run: RunRecord, phaseId: string): AiRequest[] {
  return run.requests.filter(({ request }) => request.phaseId === phaseId).map(({ request }) => request);
}

/** 当晚狼人统一刀 target（其余晚上弃刀） */
export function wolvesKill(target: number, night = 1): Override {
  return (request, snapshot) => (request.phaseId === 'wolf_kill' && snapshot.round === night ? { target } : undefined);
}

export function combine(...overrides: Override[]): Override {
  return (request, snapshot) => {
    for (const override of overrides) {
      const output = override(request, snapshot);
      if (output !== undefined) return output;
    }
    return undefined;
  };
}

/** 指定某轮某阶段所有投票者投给 target */
export function everyoneVotes(phaseId: string, target: number, round?: number): Override {
  return (request, snapshot) => {
    if (request.phaseId !== phaseId || (round !== undefined && snapshot.round !== round)) return undefined;
    return { target: (request.legalTargets ?? []).includes(target) ? target : null };
  };
}

export function act(phaseId: string, seat: number | null, targets: number[], round?: number): Override {
  return (request, snapshot) => {
    if (request.phaseId !== phaseId || (seat !== null && request.seat !== seat)) return undefined;
    if (round !== undefined && snapshot.round !== round) return undefined;
    return { targets };
  };
}
