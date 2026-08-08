import { undercoverSpeechSchema, undercoverVoteSchema } from '../../../shared/schemas/undercover';
import type { GameDefinition } from '../../../shared/types/gameEngine';
import {
  UNDERCOVER_WORKFLOW_ID,
  createUndercoverWorkflowMatch,
  runUndercoverWorkflow,
} from './workflow';
import type { UndercoverRuntimeConfig } from './workflow';

const UNDERCOVER_GAME_DEFINITION_VERSION = '1.0.0';

function createUndercoverGameDefinition(): GameDefinition {
  return {
    gameType: 'undercover',
    version: UNDERCOVER_GAME_DEFINITION_VERSION,
    workflowId: UNDERCOVER_WORKFLOW_ID,
    actionSchemas: {
      undercover_speech: undercoverSpeechSchema,
      undercover_vote: undercoverVoteSchema,
    },
    metadata: {
      label: 'AI 谁是卧底',
      session: {
        startMessage: '谁是卧底开始',
        doneMessage: '谁是卧底结束，身份已经揭晓。',
        playerSelection: {
          min: 6,
          max: 6,
          errorMessage: 'AI 谁是卧底需要选择恰好 6 位 AI 玩家。',
        },
        playback: { phaseLookahead: 1 },
      },
    },
    runtime: {
      createMatch: ({ config }) => createUndercoverWorkflowMatch((config || {}) as UndercoverRuntimeConfig),
      run: (matchId, context) => runUndercoverWorkflow(matchId, context),
    },
  };
}

export { UNDERCOVER_GAME_DEFINITION_VERSION, createUndercoverGameDefinition };
