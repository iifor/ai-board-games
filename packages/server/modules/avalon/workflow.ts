import { randomBytes } from 'node:crypto';
import type { GameRuntimeRunContext } from '../../../shared/types/gameEngine';
import { getAiConfig } from '../../config/ai';
import type { Match } from '../../types/workflow';
import { runWorkflowGameRuntime } from '../game-engine/runtime/workflowGameRuntime';
import { createWorkflowMatch, registerWorkflow } from '../workflow-engine';
import type { Workflow } from '../workflow-engine/workflowRegistry';
import { createAvalonHandlers } from './handlers';
import { toAvalonPublicState } from './presentation';
import { createInitialAvalonState } from './rules';
import type { AvalonPlayerInput, AvalonState } from './types';

const AVALON_WORKFLOW_ID = 'avalon.workflow.standard-5.v1';

interface AvalonRuntimeConfig extends Record<string, unknown> {
  selectedPlayerIds?: number[];
  players?: AvalonPlayerInput[];
  debugMode?: boolean;
  debug?: { seed?: number };
}

const steps: Workflow['steps'] = [
  { id: 'setup', type: 'avalon.setup', name: '身份分配', config: {} },
  ...Array.from({ length: 5 }, (_, missionIndex) => missionIndex + 1).flatMap((mission) =>
    Array.from({ length: 5 }, (_, attemptIndex) => attemptIndex + 1).flatMap((attempt) => [
      {
        id: `mission_${mission}_attempt_${attempt}_propose`,
        type: 'avalon.propose',
        name: `第${mission}任务第${attempt}次组队`,
        config: { mission, attempt },
      },
      {
        id: `mission_${mission}_attempt_${attempt}_team_vote`,
        type: 'avalon.team_vote',
        name: `第${mission}任务第${attempt}次表决`,
        config: { mission, attempt },
      },
      {
        id: `mission_${mission}_attempt_${attempt}_quest`,
        type: 'avalon.quest',
        name: `第${mission}任务执行`,
        config: { mission, attempt },
      },
    ]),
  ),
  { id: 'assassination', type: 'avalon.assassination', name: '刺客决断', config: {} },
  { id: 'result', type: 'avalon.result', name: '身份揭晓', config: {} },
];

const avalonWorkflow: Workflow = {
  id: AVALON_WORKFLOW_ID,
  gameType: 'avalon',
  steps,
};

function registerAvalonWorkflow(): void {
  registerWorkflow(avalonWorkflow, createAvalonHandlers());
}

async function createAvalonWorkflowMatch(config: AvalonRuntimeConfig): Promise<Match> {
  registerAvalonWorkflow();
  const players = await resolvePlayers(config);
  const debugMode = config.debugMode === true;
  const debugSeed = Number(config.debug?.seed);
  const seed = debugMode && Number.isInteger(debugSeed)
    ? debugSeed
    : randomBytes(4).readUInt32BE(0);
  const matchId = `avalon-${Date.now()}-${randomBytes(6).toString('hex')}`;
  const initialState = createInitialAvalonState(players, seed);
  initialState.id = matchId;
  return createWorkflowMatch({
    workflowId: AVALON_WORKFLOW_ID,
    gameType: 'avalon',
    matchId,
    config: {
      selectedPlayerIds: players.map((player) => player.id),
      debugMode,
    },
    initialState: { ...initialState, completedSteps: {} },
  });
}

async function runAvalonWorkflow(
  matchId: string,
  context: GameRuntimeRunContext = {},
): Promise<Record<string, unknown>> {
  return runWorkflowGameRuntime({
    matchId,
    gameType: 'avalon',
    mode: 'standard-5',
    errorLabel: '阿瓦隆',
    context,
    projectState: (state) => toAvalonPublicState(state as unknown as AvalonState) as unknown as Record<string, unknown>,
  });
}

async function resolvePlayers(config: AvalonRuntimeConfig): Promise<AvalonPlayerInput[]> {
  if (Array.isArray(config.players) && config.players.length) return config.players;
  const ids = (config.selectedPlayerIds || []).map(Number);
  return (await getAiConfig()).players
    .filter((player) => ids.includes(Number(player.id)))
    .map((player) => ({ id: player.id, nickname: player.nickname, avatar: player.avatar }));
}

export {
  AVALON_WORKFLOW_ID,
  avalonWorkflow,
  createAvalonWorkflowMatch,
  registerAvalonWorkflow,
  runAvalonWorkflow,
};
export type { AvalonRuntimeConfig };
