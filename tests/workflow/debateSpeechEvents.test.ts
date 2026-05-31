import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDebateSpeechEvents,
  projectDebateOutboxEvent,
} from '../../packages/server/modules/debate/workflow';

test('debate ai turn emits a playable speech event with game snapshot', () => {
  const match = createMatch();
  const speech = {
    phaseId: 'opening',
    kind: 'opening',
    playerId: 1,
    side: 'pro',
    debateRole: 'captain',
    speakerLabel: '正方一辩',
    text: '我方认为技术进步应当服务于人的真实需求。',
    targetId: null,
  };
  const state = createState({ id: 'opening', name: '立论陈词', speeches: [speech] });
  const step = {
    id: 'opening_pro_1',
    type: 'debate.ai_turn',
    name: '正方一辩立论',
    config: { phaseId: 'opening', action: 'opening_argue' },
  };

  const events = buildDebateSpeechEvents(match as never, step as never, state as never, 'opening', [{
    taskKey: 'opening_pro_1',
    actorId: 1,
    action: 'opening_argue',
    phaseId: 'opening',
  }] as never);

  assert.equal(events?.length, 1);
  assert.equal(events?.[0].type, 'speech');
  assert.equal(events?.[0].idempotencyKey, 'm-debate:opening_pro_1:speech:1:opening');

  const payload = events?.[0].payload as Record<string, unknown>;
  assert.equal((payload.speech as Record<string, unknown>).text, speech.text);
  assert.equal((payload.speech as Record<string, unknown>).playerId, 1);
  assert.equal((payload.phase as Record<string, unknown>).id, 'opening');
  assert.equal((payload.game as Record<string, unknown>).type, 'debate');

  const projected = projectDebateOutboxEvent({
    id: 1,
    payload: { type: 'speech', payload },
  } as never, 'm-debate');

  assert.equal(projected.type, 'speech');
  assert.equal((projected.speech as Record<string, unknown>).text, speech.text);
  assert.equal((projected.game as Record<string, unknown>).type, 'debate');
});

test('debate judge review emits speech and mvp vote does not', () => {
  const match = createMatch();
  const judgeSpeech = {
    phaseId: 'judges',
    kind: 'judge-review',
    playerId: 9,
    side: 'judge',
    debateRole: 'judge',
    speakerLabel: '评委',
    text: '正方标准更清晰，但反方反击质量也很高。',
    targetId: null,
  };
  const state = createState({ id: 'judges', name: '评委点评', speeches: [judgeSpeech] });
  const step = {
    id: 'judge_review_1',
    type: 'debate.ai_turn',
    name: '评委一点评',
    config: { phaseId: 'judges', action: 'judge_review' },
  };

  const judgeEvents = buildDebateSpeechEvents(match as never, step as never, state as never, 'judges', [{
    taskKey: 'judge_review_1',
    actorId: 9,
    action: 'judge_review',
    phaseId: 'judges',
  }] as never);

  assert.equal(judgeEvents?.length, 1);
  assert.equal((judgeEvents?.[0].payload as Record<string, unknown>).speech, judgeSpeech);

  const mvpEvents = buildDebateSpeechEvents(match as never, step as never, state as never, 'judges', [{
    taskKey: 'mvp_vote_1',
    actorId: 1,
    action: 'vote_mvp',
    phaseId: 'mvp',
    contestantIds: [1, 2, 3, 4, 5, 6, 7, 8],
  }] as never);

  assert.deepEqual(mvpEvents, []);
});

function createMatch(): Record<string, unknown> {
  return {
    id: 'm-debate',
    config: {},
    state: {},
    status: 'running',
    createdAt: 'now',
  };
}

function createState(phase: Record<string, unknown>): Record<string, unknown> {
  return {
    topic: { title: 'AI 是否应进入课堂', proPosition: '应该', conPosition: '不应该' },
    host: { id: 0, nickname: '主持人', voicePackageId: null },
    players: [
      { id: 1, nickname: '甲', side: 'pro', sideIndex: 0, debateRole: 'captain', voicePackageId: null },
      { id: 9, nickname: '评委甲', side: 'judge', debateRole: 'judge', voicePackageId: null },
    ],
    phases: [phase],
    winner: null,
    winReason: '',
    mvp: null,
    completedSteps: {},
    fallbackAudit: [],
  };
}
