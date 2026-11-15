/** 在开局时冻结，只供记忆主人所在席位使用。 */
export interface MemoryCard {
  id: number;
  content: string;
  subjectId: number | null;
  subjectName: string | null;
  phaseId: string | null;
  action: string | null;
}

export interface MemoryEvidence {
  seq: number;
  round: number;
  phaseId: string | null;
  text: string;
  channel: string;
}

export type ReviewOutcome = 'supported' | 'contradicted' | 'unresolved';
export interface MemoryDecision {
  requestId: string;
  matchId: string;
  round: number;
  phaseId: string;
  /** 请求发出时该局最后一条日志编号。 */
  throughSeq: number;
  action: string;
  choice: string;
  judgement: string;
  evidence: readonly MemoryEvidence[];
  offered: readonly number[];
  cited: readonly number[];
}

export interface MemoryUse {
  requestId: string;
  matchId: string;
  round: number;
  phaseId: string;
  action: string;
  choice: string;
  judgement: string;
  explicitlyCited: boolean;
  accepted: boolean;
  status: string;
}

export interface PlayerMemoryRecord extends MemoryCard {
  ownerId: number;
  gameKey: string;
  matchId: string;
  createdAt: string;
  evidence: readonly MemoryEvidence[];
  decision: MemoryDecision | null;
  outcome: ReviewOutcome;
  previousId: number | null;
  uses: readonly MemoryUse[];
}

export interface PlayerMemoryPage {
  records: readonly PlayerMemoryRecord[];
  total: number;
  pending: number;
  failed: number;
}

export interface ForgetMemoryResult {
  forgotten: number;
  cancelledReviews: number;
}

export type MemoryCallStatus = 'started' | 'received' | 'saved' | 'superseded' | 'call_failed' | 'invalid_reply' | 'save_failed';

export interface MemoryReviewCall {
  id: number;
  matchId: string;
  ownerId: number;
  seat: number;
  jobAttempt: number;
  modelId: number;
  providerId: number;
  model: string;
  isBackup: boolean;
  createdAt: string;
  status: MemoryCallStatus;
  detail: string | null;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface MemoryReviewCallPage {
  records: readonly MemoryReviewCall[];
  total: number;
}
