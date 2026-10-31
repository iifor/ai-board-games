import type { VoteBallot, VoteTallyRow } from '@battle/shared';

export interface Tally {
  readonly rows: VoteTallyRow[];
  /** 得票最高的座位；无人投票时为空 */
  readonly top: number[];
}

export function tallyBallots(ballots: readonly VoteBallot[]): Tally {
  const counts = new Map<number, number>();
  for (const ballot of ballots) counts.set(ballot.target, (counts.get(ballot.target) ?? 0) + ballot.weight);
  const rows = [...counts.entries()]
    .map(([target, votes]) => ({ target, votes }))
    .sort((a, b) => b.votes - a.votes || a.target - b.target);
  const best = rows[0]?.votes;
  const top = best === undefined ? [] : rows.filter((row) => row.votes === best).map((row) => row.target);
  return { rows, top };
}
