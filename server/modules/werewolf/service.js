const { getWerewolfModeConfig } = require('../werewolf-config');
const { createWerewolfSkillRegistry } = require('./roles');
const { HostAgent } = require('./agents/hostAgent');
const { createFallbackAudit } = require('./failures/fallbackAudit');
const { createAudienceSession, projectWerewolfEvent } = require('./views/viewPolicy');
const { createWerewolfAgents, createRound, publicPlayer, publicHost } = require('./agents');
const { getRoleLabel } = require('./utils');
const { runNight, announceDaybreak, revealNightResult } = require('./night');
const { runDay, maybeTransferSheriffBadge } = require('./day');
const { runSheriffElection } = require('./sheriff');
const { shouldRunFirstDaySheriffElection, checkWin } = require('./winCheck');
const { MAX_DAYS } = require('./constants');

class WerewolfGameAgent {
  constructor(config, options = {}) {
    if (config.mode !== 'real') throw new Error('全局已禁用 Mock 模式，只支持真实模式。');
    this.config = config;
    this.options = options;
    this.mode = 'real';
    this.modeConfig = getWerewolfModeConfig(config.werewolfMode);
    this.skillRegistry = createWerewolfSkillRegistry();
    this.gameId = `werewolf-${Date.now()}`;
    this.fallbackAudit = createFallbackAudit(this.gameId);
    this.agents = createWerewolfAgents(config, this.modeConfig, this.skillRegistry, this.fallbackAudit);
    this.audienceSession = createAudienceSession(this.agents, config.clientViewMode, config.viewerPlayerId);
    this.hostAgent = new HostAgent(config.host, { onFallback: (entry) => this.fallbackAudit.record(entry) });
    this.rounds = [];
    this.werewolfMode = config.werewolfMode;
    this.winner = null;
    this.winReason = '';
  }

  buildCtx() {
    return {
      agents: this.agents,
      rounds: this.rounds,
      modeConfig: this.modeConfig,
      skillRegistry: this.skillRegistry,
      emit: (event) => this.emit(event),
      serialize: (patch) => this.serialize(patch)
    };
  }

  async run() {
    await this.emit({ type: 'players', players: this.serialize().players, game: this.serialize() });

    for (let day = 1; day <= MAX_DAYS && !this.winner; day += 1) {
      const round = createRound(day);
      round.sheriffId = this.getActiveSheriffId();
      round.sheriffBadge.status = round.sheriffId ? 'held' : 'none';
      this.rounds.push(round);
      const ctx = this.buildCtx();

      await runNight(ctx, round);
      await announceDaybreak(ctx, round);

      if (shouldRunFirstDaySheriffElection(round, this.modeConfig)) {
        await runSheriffElection(ctx, round);
      }

      await revealNightResult(ctx);

      for (const death of round.night.deaths) {
        await maybeTransferSheriffBadge(ctx, round, death.id, death.reason, 'night');
      }

      this.applyWinCheck(day, { checkWolfVoteLock: true, sheriffId: round.sheriffId });
      if (this.winner) break;

      await runDay(ctx, round);
      this.applyWinCheck(day);
    }

    if (!this.winner) {
      const aliveWolves = this.agents.filter((agent) => agent.alive && agent.faction === 'wolves').length;
      this.winner = aliveWolves ? 'wolves' : 'good';
      this.winReason = aliveWolves ? '达到最大天数，狼人仍有存活，狼人阵营险胜。' : '达到最大天数，狼人全部出局，好人阵营胜利。';
    }

    const game = this.serialize();
    await this.emit({ type: 'game', game });
    return game;
  }

  async emit(event) {
    if (!this.options.onEvent) return undefined;
    const projected = projectWerewolfEvent(event, this.audienceSession);
    return projected ? this.options.onEvent(projected) : undefined;
  }

  serialize(patch = {}) {
    const modeDetail = getWerewolfModeConfig(this.werewolfMode);
    const winner = patch.winner ?? this.winner;
    return {
      id: this.gameId, gameType: 'werewolf', type: 'werewolf', mode: this.mode,
      event: {
        id: 'ai-werewolf', name: `AI 狼人杀 · ${modeDetail.name}`,
        version: modeDetail.version || 'v1.0', background: modeDetail.background,
        mode: modeDetail.name,
        terms: { investigators: '好人阵营', mist: '狼人阵营', keyFigure: '狼人', cover: '神职' },
        truth: winner ? this.agents.map((agent) => `${agent.id}号${getRoleLabel(agent)}`).join('；') : ''
      },
      clientViewMode: this.audienceSession.mode,
      audienceSession: this.audienceSession,
      fallbackAudit: this.fallbackAudit.list(),
      host: publicHost(this.config.host),
      werewolfMode: modeDetail,
      players: this.agents.map(publicPlayer).sort((a, b) => Number(a.id) - Number(b.id)),
      rounds: this.rounds,
      winner,
      winReason: patch.winReason ?? this.winReason,
      createdAt: new Date().toISOString()
    };
  }

  getActiveSheriffId() {
    const previousRound = this.rounds.at(-1);
    const sheriffId = previousRound?.sheriffId;
    return this.agents.some((agent) => agent.alive && Number(agent.id) === Number(sheriffId)) ? sheriffId : null;
  }

  applyWinCheck(day, options = {}) {
    const result = checkWin(this.agents, day, this.modeConfig, options);
    this.winner = result.winner;
    this.winReason = result.winReason;
  }
}

async function runWerewolfGame(config, options = {}) {
  const agent = new WerewolfGameAgent(config, options);
  return agent.run();
}

module.exports = { WerewolfGameAgent, runWerewolfGame };
