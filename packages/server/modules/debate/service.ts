import { createTraceContext, flushTrace, markTraceComplete, markTraceError, recordDecision, recordEvent, recordSnapshot } from '../observability';
import type { TraceContext } from '../observability/tracer';
import { BaseGameAgent, createFallbackAudit } from '../agent-core';
import type { FallbackEvent as AgentFallbackEvent } from '../agent-core/fallbackAudit';
import { createDebateSkillRegistry } from './skillRegistry';
import { createDebateRoleSkillRegistry } from './roleSkills';
import { DebateAgent } from './playerAgent';
import { PHASES, TOPICS } from './constants';
import { buildSystemPrompt } from './prompts';
import type { Topic } from './prompts';
import { buildAgentHash, choose, getConfiguredDebateSetup, normalizeTopic, serializeGame } from './utils';
import type { DebatePlayer, DebatePhase, DebateHost, DebateConfig, SerializedGame } from './utils';
import {
  runStrategyPhase, runOpeningPhase, runCrossfirePhase, runFreePhase,
  runClosingPhase, runAwardPhases, runPostgamePhase,
} from './phases';
import type { PhaseContext } from './phases';

interface GameOptions {
  onEvent?: (event: Record<string, unknown>) => void;
}

class DebateGameAgent extends BaseGameAgent {
  config: DebateConfig;
  options: GameOptions;
  mode: string;
  topic: Topic;
  gameId: string;
  trace: TraceContext;
  roleSkillRegistry: ReturnType<typeof createDebateRoleSkillRegistry>;
  fallbackAudit: ReturnType<typeof createFallbackAudit>;
  agents: DebatePlayer[];
  phases: DebatePhase[];
  host: DebateHost | null;
  winner: string | null;
  mvp: Record<string, unknown> | null;
  winReason: string;

  constructor(config: DebateConfig, options: GameOptions = {}) {
    if (config.mode !== 'real') throw new Error('全局已禁用 Mock 模式，只支持真实模式。');
    const skillRegistry = createDebateSkillRegistry();
    super({ gameType: 'debate', skillRegistry: skillRegistry as never });
    this.config = config;
    this.options = options;
    this.mode = 'real';
    this.topic = normalizeTopic(config.topic) || choose(TOPICS);
    this.gameId = `debate-${Date.now()}`;
    this.config._gameId = this.gameId;
    this.trace = createTraceContext(this.gameId, 'debate', '');
    this.roleSkillRegistry = createDebateRoleSkillRegistry(this.skillRegistry as never);
    this.fallbackAudit = createFallbackAudit(this.gameId, 'debate', {
      gameType: 'debate',
      onRecord: (event: AgentFallbackEvent) => this.recordFallback(event),
    });
    this.agents = createDebateAgents(config, this.topic, this.fallbackAudit, this.gameId, this.roleSkillRegistry);
    this.phases = [];
    this.host = config.host || null;
    this.winner = null;
    this.mvp = null;
    this.winReason = '';
  }

  buildCtx(): PhaseContext {
    return {
      config: this.config as unknown as PhaseContext['config'],
      state: this as unknown as PhaseContext['state'],
      skillRegistry: this.skillRegistry,
      fallbackAudit: this.fallbackAudit,
      emit: (event: Record<string, unknown>) => this.emit(event),
      serialize: (patch?: Record<string, unknown>) => this.serialize(patch) as unknown as Record<string, unknown>,
    };
  }

  async run(): Promise<SerializedGame> {
    try {
      recordSnapshot(this.trace, 'game-start', this.serialize() as unknown as Parameters<typeof recordSnapshot>[2], { phase: 'init' });
      await this.emit({ type: 'players', players: this.serialize().players, game: this.serialize() });
      const ctx = this.buildCtx();
      await runStrategyPhase(ctx);
      await runOpeningPhase(ctx);
      await runCrossfirePhase(ctx);
      await runFreePhase(ctx);
      await runClosingPhase(ctx);
      const awards = await runAwardPhases(ctx);
      this.winner = awards.winner;
      this.winReason = awards.winReason;
      this.mvp = awards.mvp || null;
      await runPostgamePhase(ctx);
      const game = this.serialize();
      await this.emit({ type: 'game', game });
      markTraceComplete(this.trace);
      recordSnapshot(this.trace, 'game-end', game as unknown as Parameters<typeof recordSnapshot>[2], { phase: 'game-end' });
      return game;
    } catch (error) {
      markTraceError(this.trace, (error as Error).message);
      recordSnapshot(this.trace, 'error', this.serialize() as unknown as Parameters<typeof recordSnapshot>[2], { phase: 'error' });
      throw error;
    } finally {
      flushTrace(this.trace);
    }
  }

  async emit(event: Record<string, unknown>): Promise<void> {
    recordEvent(this.trace, event);
    return this.options.onEvent ? this.options.onEvent(event) : undefined;
  }

  serialize(patch: Record<string, unknown> = {}): SerializedGame {
    return serializeGame({
      gameId: this.gameId,
      mode: this.mode,
      topic: this.topic,
      agents: this.agents,
      phases: this.phases,
      host: this.host,
      winner: (patch.winner as string | null) ?? this.winner,
      mvp: (patch.mvp as Record<string, unknown> | null) ?? this.mvp,
      winReason: (patch.winReason as string) ?? this.winReason,
      fallbackAudit: this.fallbackAudit.list(),
    });
  }

  recordFallback(event: AgentFallbackEvent): void {
    recordEvent(this.trace, event as unknown as Parameters<typeof recordEvent>[1]);
    recordDecision(this.trace, {
      playerId: event.actorId != null ? Number(event.actorId) || 0 : 0,
      decisionType: 'fallback',
      phase: event.phase,
      promptText: '',
      responseText: '',
      chosenTarget: null,
      fallbackUsed: true,
      fallbackReason: event.reason,
      skillId: event.skillId,
    });
    this.options.onEvent?.(event as unknown as Record<string, unknown>);
  }
}

function createDebateAgents(
  config: DebateConfig,
  topic: Topic,
  fallbackAudit: ReturnType<typeof createFallbackAudit>,
  gameId: string,
  roleSkillRegistry: ReturnType<typeof createDebateRoleSkillRegistry> | null = null,
): DebatePlayer[] {
  const setup = getConfiguredDebateSetup(config);
  return setup.players.map((player, index) => {
    const side = index < 4 ? 'pro' : index < 8 ? 'con' : 'judge';
    const debateRole = side === 'judge'
      ? 'judge'
      : Number(player.id) === Number(side === 'pro' ? setup.proCaptainId : setup.conCaptainId)
        ? 'captain'
        : 'debater';
    const agent: DebatePlayer = {
      ...player,
      side: side as 'pro' | 'con' | 'judge',
      sideIndex: side === 'judge' ? null : index % 4,
      debateRole: debateRole as 'captain' | 'debater' | 'judge',
      sideLabel: side === 'pro' ? '正方' : side === 'con' ? '反方' : '评委席',
      debateRoleLabel: debateRole === 'captain' ? '队长' : debateRole === 'judge' ? '评委' : '选手',
      speeches: [],
      messages: [],
    };
    agent.baseSystemPrompt = buildSystemPrompt(agent, topic, PHASES[0]);
    agent.baseSystemPromptHash = buildAgentHash(agent.baseSystemPrompt as string);
    const playerAgent = new DebateAgent(agent, agent.baseSystemPrompt as string, {
      onFallback: (entry: Record<string, unknown>) => fallbackAudit.record(entry as unknown as Parameters<typeof fallbackAudit.record>[0]),
      gameId,
    });
    agent.playerAgent = playerAgent as unknown as DebatePlayer['playerAgent'];
    roleSkillRegistry?.applyToPlayer(playerAgent as never, debateRole);
    agent.messages = (playerAgent as unknown as { messages: DebatePlayer['messages'] }).messages;
    return agent;
  });
}

async function runDebateGame(config: DebateConfig, options: GameOptions = {}): Promise<SerializedGame> {
  const agent = new DebateGameAgent(config, options);
  return agent.run();
}

export { DebateGameAgent, runDebateGame, createDebateAgents };
