import { describe, expect, it } from 'vitest';
import { formatMatchTitle } from './format';
import { speechOf, type SpeechContent } from './speech';
import type { AudienceView, StagePayload, StagePayloadKind, StageEvent } from './stage';

const view: AudienceView = {
  gameKey: 'werewolf', title: 'AI 狼人杀', round: 1, phase: null, status: 'running', seats: [], extra: {}, result: null,
};

const event = (payload: StagePayload): StageEvent => ({ ...payload, seq: 1, round: 1, phaseId: 'day', channel: 'public', view });

/**
 * 每种舞台事件都必须在这里给出朗读口径：新增事件类型时这张表编译不过，
 * 逼着决定它读不读、由谁读（服务端合成语音与客户端朗读都只认 speechOf）。
 */
const CASES: Record<StagePayloadKind, { readonly payload: StagePayload; readonly expected: SpeechContent | null }> = {
  phase_started: { payload: { kind: 'phase_started', title: '白天发言' }, expected: null },
  narration: { payload: { kind: 'narration', text: '天亮了' }, expected: { text: '天亮了', seat: null } },
  speech: { payload: { kind: 'speech', seat: 3, text: '我是预言家' }, expected: { text: '我是预言家', seat: 3 } },
  action: {
    payload: { kind: 'action', seat: 2, action: 'shoot', targets: [5], text: '2号开枪带走了5号' },
    expected: { text: '2号开枪带走了5号', seat: null },
  },
  vote_tallied: {
    payload: { kind: 'vote_tallied', title: '放逐投票', runoff: 0, ballots: [], abstained: [], tally: [], tied: [], outcome: { kind: 'none' } },
    expected: null,
  },
  judgement: {
    payload: { kind: 'judgement', seat: 9, verdict: 'pro', verdictLabel: '正方胜', comment: '论证更完整' },
    expected: { text: '正方胜。论证更完整', seat: 9 },
  },
  seat_eliminated: { payload: { kind: 'seat_eliminated', seat: 4, reason: '被放逐' }, expected: null },
  revealed: { payload: { kind: 'revealed', text: '身份揭晓', data: {} }, expected: { text: '身份揭晓', seat: null } },
  fallback: { payload: { kind: 'fallback', seat: 6, reason: '输出不合法' }, expected: null },
  game_over: {
    payload: { kind: 'game_over', result: { winner: 'good', winnerLabel: '好人胜', summary: '好人阵营获胜', mvp: 3, endReason: 'normal' } },
    expected: { text: '好人阵营获胜', seat: null },
  },
};

describe('speechOf', () => {
  it.each(Object.entries(CASES))('%s', (_kind, { payload, expected }) => {
    expect(speechOf(event(payload))).toEqual(expected);
  });
});

describe('formatMatchTitle', () => {
  it('joins the game and board, or shows the game alone', () => {
    expect(formatMatchTitle({ gameTitle: 'AI 狼人杀', variantName: '白狼王&守卫' })).toBe('AI 狼人杀 · 白狼王&守卫');
    expect(formatMatchTitle({ gameTitle: 'AI 辩论赛', variantName: null })).toBe('AI 辩论赛');
  });
});
