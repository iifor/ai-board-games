// 对局播放协议：引擎日志与前端 StageEvent 共用同一套事件词表。

export type Channel = 'public' | 'host' | `team:${string}` | `private:${number}`;

export type VoteOutcome =
  | { readonly kind: 'selected'; readonly seat: number; readonly byTieBreak: boolean }
  | { readonly kind: 'none' };

export interface VoteBallot {
  readonly voter: number;
  readonly target: number;
  readonly weight: number;
}

export interface VoteTallyRow {
  readonly target: number;
  readonly votes: number;
}

export type EndReason = 'normal' | 'budget';

export interface GameResult {
  /** 获胜阵营 key、平局 key，或无胜负时为 null */
  readonly winner: string | null;
  readonly winnerLabel: string;
  readonly summary: string;
  readonly mvp: number | null;
  readonly endReason: EndReason;
}

export type StagePayload =
  | { readonly kind: 'phase_started'; readonly title: string }
  | { readonly kind: 'narration'; readonly text: string }
  | { readonly kind: 'speech'; readonly seat: number; readonly text: string }
  | {
      readonly kind: 'action';
      readonly seat: number;
      readonly action: string;
      readonly targets: readonly number[];
      readonly text: string;
    }
  | {
      readonly kind: 'vote_tallied';
      readonly title: string;
      readonly runoff: number;
      readonly ballots: readonly VoteBallot[];
      readonly tally: readonly VoteTallyRow[];
      readonly tied: readonly number[];
      readonly outcome: VoteOutcome | null;
    }
  | {
      readonly kind: 'judgement';
      readonly seat: number;
      readonly verdict: string;
      readonly verdictLabel: string;
      readonly comment: string;
    }
  | { readonly kind: 'seat_eliminated'; readonly seat: number; readonly reason: string }
  | { readonly kind: 'revealed'; readonly text: string; readonly data: Readonly<Record<string, unknown>> }
  | { readonly kind: 'fallback'; readonly seat: number; readonly reason: string }
  | { readonly kind: 'game_over'; readonly result: GameResult };

export type StagePayloadKind = StagePayload['kind'];

export interface StageEventMeta {
  readonly seq: number;
  readonly round: number;
  readonly phaseId: string | null;
  readonly channel: Channel;
}

export interface AudienceSeat {
  readonly seat: number;
  readonly name: string;
  readonly avatar: string | null;
  readonly label: string;
  readonly alive: boolean;
  /** 观众不可见时为 null */
  readonly role: string | null;
  readonly roleName: string | null;
  readonly team: string | null;
  readonly position: number | null;
}

export interface AudienceView {
  readonly gameKey: string;
  readonly title: string;
  readonly round: number;
  readonly phase: { readonly id: string; readonly title: string } | null;
  readonly status: 'running' | 'completed';
  readonly seats: readonly AudienceSeat[];
  readonly extra: Readonly<Record<string, unknown>>;
  readonly result: GameResult | null;
}

export type StageEvent = StagePayload & StageEventMeta & { readonly view: AudienceView };
