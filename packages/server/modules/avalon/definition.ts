import {
  avalonAssassinationSchema,
  avalonProposalSchema,
  avalonQuestVoteSchema,
  avalonTeamVoteSchema,
} from '../../../shared/schemas/avalon';
import type { GameDefinition } from '../../../shared/types/gameEngine';
import {
  AVALON_WORKFLOW_ID,
  createAvalonWorkflowMatch,
  runAvalonWorkflow,
} from './workflow';
import type { AvalonRuntimeConfig } from './workflow';

const AVALON_GAME_DEFINITION_VERSION = '1.0.0';

function createAvalonGameDefinition(): GameDefinition {
  return {
    gameType: 'avalon',
    version: AVALON_GAME_DEFINITION_VERSION,
    workflowId: AVALON_WORKFLOW_ID,
    actionSchemas: {
      avalon_propose_team: avalonProposalSchema,
      avalon_team_vote: avalonTeamVoteSchema,
      avalon_quest_vote: avalonQuestVoteSchema,
      avalon_assassinate: avalonAssassinationSchema,
    },
    metadata: {
      label: 'AI 阿瓦隆',
      mode: 'standard-5',
      session: {
        startMessage: '阿瓦隆开始，身份将私密分配。',
        doneMessage: '阿瓦隆结束，所有身份已揭晓。',
        emitStartEvent: true,
        completionEventType: 'done',
        playerSelection: {
          min: 5,
          max: 5,
          defaultCount: 5,
          errorMessage: 'AI 阿瓦隆需要选择恰好 5 位 AI 玩家。',
        },
        playback: { phaseLookahead: 1 },
      },
    },
    runtime: {
      createMatch: ({ config }) => createAvalonWorkflowMatch((config || {}) as AvalonRuntimeConfig),
      run: (matchId, context) => runAvalonWorkflow(matchId, context),
    },
  };
}

export { AVALON_GAME_DEFINITION_VERSION, createAvalonGameDefinition };
