const { createTraceContext, flushTrace, markTraceComplete, markTraceError, recordDecision, recordEvent, recordSnapshot } = require('../observability');
const { BaseGameAgent, createFallbackAudit } = require('../agent-core');
const { createDebateSkillRegistry } = require('./skillRegistry');
const { createDebateRoleSkillRegistry } = require('./roleSkills');
const { DebateAgent } = require('./playerAgent');
const { PHASES, TOPICS } = require('./constants');
const { buildSystemPrompt } = require('./prompts');
const { buildAgentHash, choose, getConfiguredDebateSetup, normalizeTopic, serializeGame } = require('./utils');
const {
  runStrategyPhase, runOpeningPhase, runCrossfirePhase, runFreePhase,
  runClosingPhase, runAwardPhases, runPostgamePhase
} = require('./phases');

class DebateGameAgent extends BaseGameAgent {
  constructor(config, options = {}) {
    if (config.mode !== 'real') throw new Error('全局已禁用 Mock 模式，只支持真实模式。');
    const skillRegistry = createDebateSkillRegistry();
    super({ gameType: 'debate', skillRegistry });
    this.config = config;
    this.options = options;
    this.mode = 'real';
    this.topic = normalizeTopic(config.topic) || choose(TOPICS);
    this.gameId = `debate-${Date.now()}`;
    this.config._gameId = this.gameId;
    this.trace = createTraceContext(this.gameId, 'debate', '');
    this.roleSkillRegistry = createDebateRoleSkillRegistry(this.skillRegistry);
    this.fallbackAudit = createFallbackAudit(this.gameId, 'debate', {
      gameType: 'debate',
      onRecord: (event) => this.recordFallback(event)
    });
    this.agents = createDebateAgents(config, this.topic, this.fallbackAudit, this.gameId, this.roleSkillRegistry);
    this.phases = [];
    this.host = config.host;
    this.winner = null;
    this.mvp = null;
    this.winReason = '';
  }

  buildCtx() {
    return {
      config: this.config,
      state: this,
      skillRegistry: this.skillRegistry,
      fallbackAudit: this.fallbackAudit,
      emit: (event) => this.emit(event),
      serialize: (patch) => this.serialize(patch)
    };
  }

  async run() {
    try {
      recordSnapshot(this.trace, 'game-start', this.serialize(), { phase: 'init' });
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
      this.mvp = awards.mvp;
      await runPostgamePhase(ctx);
      const game = this.serialize();
      await this.emit({ type: 'game', game });
      markTraceComplete(this.trace);
      recordSnapshot(this.trace, 'game-end', game, { phase: 'game-end' });
      return game;
    } catch (error) {
      markTraceError(this.trace, error.message);
      recordSnapshot(this.trace, 'error', this.serialize(), { phase: 'error' });
      throw error;
    } finally {
      flushTrace(this.trace);
    }
  }

  async emit(event) {
    recordEvent(this.trace, event);
    return this.options.onEvent ? this.options.onEvent(event) : undefined;
  }

  serialize(patch = {}) {
    return serializeGame({
      gameId: this.gameId,
      mode: this.mode,
      topic: this.topic,
      agents: this.agents,
      phases: this.phases,
      host: this.host,
      winner: patch.winner ?? this.winner,
      mvp: patch.mvp ?? this.mvp,
      winReason: patch.winReason ?? this.winReason,
      fallbackAudit: this.fallbackAudit.list()
    });
  }

  recordFallback(event) {
    recordEvent(this.trace, event);
    recordDecision(this.trace, {
      playerId: event.actorId != null ? Number(event.actorId) || 0 : 0,
      decisionType: 'fallback',
      phase: event.phase,
      promptText: '',
      responseText: '',
      chosenTarget: null,
      fallbackUsed: true,
      fallbackReason: event.reason,
      skillId: event.skillId
    });
    this.options.onEvent?.(event);
  }
}

function createDebateAgents(config, topic, fallbackAudit, gameId, roleSkillRegistry = null) {
  const setup = getConfiguredDebateSetup(config);
  return setup.players.map((player, index) => {
    const side = index < 4 ? 'pro' : index < 8 ? 'con' : 'judge';
    const debateRole = side === 'judge'
      ? 'judge'
      : Number(player.id) === Number(side === 'pro' ? setup.proCaptainId : setup.conCaptainId)
        ? 'captain'
        : 'debater';
    const agent = {
      ...player,
      side,
      sideIndex: side === 'judge' ? null : index % 4,
      debateRole,
      sideLabel: side === 'pro' ? '正方' : side === 'con' ? '反方' : '评委席',
      debateRoleLabel: debateRole === 'captain' ? '队长' : debateRole === 'judge' ? '评委' : '选手',
      speeches: [],
      messages: []
    };
    agent.baseSystemPrompt = buildSystemPrompt(agent, topic, PHASES[0]);
    agent.baseSystemPromptHash = buildAgentHash(agent.baseSystemPrompt);
    agent.playerAgent = new DebateAgent(agent, agent.baseSystemPrompt, {
      onFallback: (entry) => fallbackAudit.record(entry),
      gameId
    });
    roleSkillRegistry?.applyToPlayer(agent.playerAgent, debateRole);
    agent.messages = agent.playerAgent.messages;
    return agent;
  });
}

async function runDebateGame(config, options = {}) {
  const agent = new DebateGameAgent(config, options);
  return agent.run();
}

module.exports = { DebateGameAgent, runDebateGame, createDebateAgents };
