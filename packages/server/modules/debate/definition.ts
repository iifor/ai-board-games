/**
 * 辩论赛 GameDefinition
 *
 * 实现 GameDefinition 接口，让辩论赛通过 GameEngine 统一入口运行。
 * 辩论赛是纯顺序执行（无 action window / effect / channel），不需要自定义 runtime。
 * GameEngine 通过 workflow-engine 路径驱动，definition 提供元数据和结构。
 */

import type { GameDefinition } from '@ai-presenter/shared/types/gameEngine';
import { DEBATE_WORKFLOW_ID } from './workflow';

const DEBATE_DEFINITION_VERSION = '1.0.0';

/**
 * 创建辩论赛 GameDefinition
 *
 * 辩论赛不使用 action windows、effects 或 channels（所有信息都是公开的），
 * 所以 definition 只提供元数据。实际执行通过 workflow-engine 路径。
 *
 * 注册到 GameEngine 后，可以通过：
 * - `engine.createMatch({ gameType: 'debate', ... })` 创建对局
 * - `engine.tick(matchId)` 推进对局
 * - `engine.getDebugState(matchId)` 查看调试状态
 */
function createDebateGameDefinition(): GameDefinition {
  return {
    gameType: 'debate',
    version: DEBATE_DEFINITION_VERSION,
    workflowId: DEBATE_WORKFLOW_ID,
    metadata: {
      name: 'AI 辩论赛',
      description: '8 名 AI 辩手 + 评委的辩论赛，包含立论、攻辩、自由辩论、总结、评委点评、MVP 评选等阶段。',
      phases: ['strategy', 'opening', 'crossfire', 'free', 'closing', 'judges', 'mvp', 'postgame'],
      maxPlayers: 12,
      minPlayers: 9,
      session: {
        startMessage: '辩论赛开始',
        doneMessage: '辩论赛结束，完整赛果已生成。',
        playback: { phaseLookahead: 1 },
      },
    },
  };
}

export { createDebateGameDefinition, DEBATE_DEFINITION_VERSION };
