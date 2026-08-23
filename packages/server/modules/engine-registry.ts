/**
 * GameEngine 单例 + 游戏注册
 *
 * 所有游戏通过这里注册到 GameEngine。
 * game-socket 通过这个入口获取 engine 实例。
 */

import { GameEngine } from './game-engine';
import { createDebateGameDefinition } from './debate/definition';
import { registerDebateWorkflow } from './debate/workflow';
import { createWerewolfGameDefinition } from './werewolf/definition';
import { registerWerewolfWorkflow } from './werewolf/workflow';
import { createUndercoverGameDefinition } from './undercover/definition';
import { registerUndercoverWorkflow } from './undercover/workflow';
import { runDebateViaEngine } from './debate-runner';
import { runWerewolfViaEngine } from './werewolf-runner';
import type { DebateConfig } from './debate/utils';
import { createAvalonGameDefinition } from './avalon/definition';
import { registerAvalonWorkflow } from './avalon/workflow';

let engine: GameEngine | null = null;

/**
 * 获取全局 GameEngine 单例
 *
 * 首次调用时自动注册所有已实现的 GameDefinition。
 */
function getGameEngine(): GameEngine {
  if (engine) return engine;

  engine = new GameEngine();

  // 注册辩论赛
  registerDebateWorkflow();
  engine.registerDefinition(createDebateGameDefinition({
    execute: async ({ config }, context) => runDebateViaEngine(
      (config || {}) as unknown as DebateConfig,
      context,
    ) as unknown as Record<string, unknown>,
  }));

  // 注册狼人杀
  registerWerewolfWorkflow();
  engine.registerDefinition(createWerewolfGameDefinition({
    execute: ({ config }, context) => runWerewolfViaEngine(config || {}, context),
  }));

  // 注册谁是卧底
  registerUndercoverWorkflow();
  engine.registerDefinition(createUndercoverGameDefinition());

  // 注册阿瓦隆（第四种 definition-runtime 游戏）
  registerAvalonWorkflow();
  engine.registerDefinition(createAvalonGameDefinition());

  return engine;
}

/**
 * 重置引擎（仅用于测试）
 */
function resetGameEngine(): void {
  engine = null;
}

export { getGameEngine, resetGameEngine };
