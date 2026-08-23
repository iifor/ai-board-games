import test from 'node:test';
import assert from 'node:assert/strict';
import * as repository from '../../packages/server/modules/workflow-engine/repository';
import { createAvalonHandlers } from '../../packages/server/modules/avalon/handlers';
import { avalonWorkflow } from '../../packages/server/modules/avalon/workflow';
import { createInitialAvalonState } from '../../packages/server/modules/avalon/rules';

test('Avalon debug workflow completes a standard game without leaking secret votes or roles', async () => {
  const repositoryApi = repository as unknown as {
    listAiTasks: typeof repository.listAiTasks;
    listEvents: typeof repository.listEvents;
  };
  const originalListAiTasks = repositoryApi.listAiTasks;
  const originalListEvents = repositoryApi.listEvents;
  const completedTasks: Record<string, unknown>[] = [];
  repositoryApi.listAiTasks = async () => completedTasks as never;
  repositoryApi.listEvents = async () => [];

  try {
    const handlers = createAvalonHandlers();
    const steps = avalonWorkflow.steps;
    const stepById = new Map(steps.map((step, index) => [step.id, { step, index }]));
    let currentStepId = steps[0].id;
    let state = {
      ...createInitialAvalonState(
        Array.from({ length: 5 }, (_, index) => ({ id: index + 1, nickname: `玩家${index + 1}` })),
        20260823,
      ),
      completedSteps: {},
    };
    const publicEvents: Record<string, unknown>[] = [];
    let completed = false;

    for (let guard = 0; guard < 100 && !completed; guard += 1) {
      const entry = stepById.get(currentStepId);
      assert.ok(entry, `unknown workflow step: ${currentStepId}`);
      const handler = handlers[entry.step.type];
      assert.ok(handler, `missing handler: ${entry.step.type}`);
      const match = { id: 'avalon-debug-test', config: { debugMode: true }, state };
      let result = await handler.execute({ match, workflow: avalonWorkflow, step: entry.step, state });

      if (result.status === 'WAITING') {
        assert.ok(handler.runAiTask, `${entry.step.type} must execute queued AI tasks`);
        for (const task of result.tasks || []) {
          const aiResult = await handler.runAiTask({
            match: { ...match, state: result.state || state },
            workflow: avalonWorkflow,
            step: entry.step,
            task,
          });
          handler.validateAiResult?.({
            match,
            workflow: avalonWorkflow,
            step: entry.step,
            task,
            result: aiResult,
          });
          completedTasks.push({ ...task, status: 'succeeded', result: aiResult });
        }
        state = (result.state || state) as typeof state;
        result = await handler.execute({
          match: { ...match, state },
          workflow: avalonWorkflow,
          step: entry.step,
          state,
        });
      }

      assert.equal(result.status, 'COMPLETED');
      state = (result.state || state) as typeof state;
      publicEvents.push(...(result.events || []));
      completed = result.matchStatus === 'completed';
      if (!completed) {
        currentStepId = result.nextStepId || steps[entry.index + 1]?.id;
        assert.ok(currentStepId, 'workflow ended before a terminal result');
      }
    }

    assert.equal(completed, true);
    assert.equal(state.status, 'completed');
    assert.ok(state.winner === 'good' || state.winner === 'evil');
    assert.equal(state.missions.filter((mission) => mission.status === 'success' || mission.status === 'fail').length >= 3, true);

    const terminalEvents = publicEvents.filter((event) =>
      ((event.payload as Record<string, unknown> | undefined)?.game as Record<string, unknown> | undefined)?.status === 'completed',
    );
    assert.equal(terminalEvents.some((event) => event.type === 'avalon-game-result'), true);
    for (const event of publicEvents.filter((item) => !terminalEvents.includes(item))) {
      assert.doesNotMatch(JSON.stringify(event.payload), /"role"|"faction"|teamVotes|questVotes|"seed"/);
    }
    for (const event of terminalEvents) {
      assert.doesNotMatch(JSON.stringify(event), /teamVotes|questVotes|"seed"/);
      assert.match(JSON.stringify(event), /"reveal"/);
    }
  } finally {
    repositoryApi.listAiTasks = originalListAiTasks;
    repositoryApi.listEvents = originalListEvents;
  }
});
