import assert from 'node:assert/strict';
import test from 'node:test';
import { createUndercoverWorkflowMatch, registerUndercoverWorkflow } from '../../packages/server/modules/undercover/workflow';
import { claimNextAiTask, completeAiTask, getDebugState } from '../../packages/server/modules/workflow-engine';

function createDebugMatch() {
  return createUndercoverWorkflowMatch({
    selectedPlayerIds: [1, 2, 3, 4, 5, 6],
    debugMode: true,
    debug: { seed: 7, civilianWord: '咖啡', undercoverWord: '茶', undercoverPlayerId: 6 },
    players: Array.from({ length: 6 }, (_, index) => ({ id: index + 1, nickname: `${index + 1}号` })),
  });
}

test('undercover workflow completes a civilian win and persists public events', () => {
  registerUndercoverWorkflow();
  const match = createDebugMatch();

  for (let guard = 0; guard < 80; guard += 1) {
    const current = getDebugState(match.id).match;
    if (current.status === 'completed') break;
    const task = claimNextAiTask({ matchId: match.id, workerId: 'undercover-test' });
    assert.ok(task, `expected queued task at ${current.currentStepIndex}`);
    const payload = task.action === 'undercover_speech'
      ? { action: task.action, speech: '常见描述' }
      : { action: task.action, targetId: Number(task.playerId) === 6 ? 1 : 6, reason: '测试票' };
    completeAiTask(task.id, { eventType: 'ai_task_succeeded', payload });
  }

  const completed = getDebugState(match.id);
  assert.equal(completed.match.status, 'completed');
  assert.equal(completed.match.state.winner, 'civilians');
  assert.doesNotMatch(JSON.stringify(completed.events.filter((event) => event.visibility !== 'system').slice(0, -1)), /咖啡|茶|undercoverPlayerId/);
});

test('persisted speech results are leak-guarded before public emission', () => {
  const match = createDebugMatch();
  const task = claimNextAiTask({ matchId: match.id, workerId: 'undercover-leak-test' });
  assert.equal(task?.action, 'undercover_speech');
  completeAiTask(task!.id, { payload: { action: task!.action, speech: '我喜欢咖啡' } });

  const current = getDebugState(match.id);
  assert.equal(current.match.state.speeches[0].text, '这个事物在生活中并不少见');
  assert.doesNotMatch(JSON.stringify(current.events.filter((event) => event.visibility === 'public')), /咖啡|茶/);
});

test('persisted invalid ballots use legal seeded targets before publication', () => {
  const match = createDebugMatch();
  for (let index = 0; index < 6; index += 1) {
    const task = claimNextAiTask({ matchId: match.id, workerId: 'undercover-ballot-test' });
    assert.equal(task?.action, 'undercover_speech');
    completeAiTask(task!.id, { payload: { action: task!.action, speech: '常见描述' } });
  }
  for (let index = 0; index < 6; index += 1) {
    const task = claimNextAiTask({ matchId: match.id, workerId: 'undercover-ballot-test' });
    assert.equal(task?.action, 'undercover_vote');
    completeAiTask(task!.id, { payload: { action: task!.action, targetId: Number(task!.playerId), reason: '自投' } });
  }

  const voteEvent = getDebugState(match.id).events.find((event) => event.type === 'undercover-vote-result');
  const votes = (voteEvent?.payload as { payload?: { votes?: Record<string, number> } })?.payload?.votes || {};
  assert.equal(Object.keys(votes).length, 6);
  assert.ok(Object.entries(votes).every(([voterId, targetId]) => Number(voterId) !== targetId));
});
