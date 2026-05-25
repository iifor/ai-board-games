import { getWerewolfModeConfig } from '../werewolf-config';
import { BaseGameAgent } from '../agent-core';
const { createWerewolfSkillRegistry } = require('./roles');
const { createWerewolfRoleSkillRegistry } = require('./roleSkills');
const { HostAgent } = require('./agents/hostAgent');
import { createFallbackAudit } from './failures/fallbackAudit';
import { createAudienceSession, projectWerewolfEvent } from './views/viewPolicy';
import type { AudienceSession, ProjectionContext } from './views/viewPolicy';
const { createWerewolfAgents, createRound, publicPlayer, publicHost } = require('./agents');
const { getRoleLabel } = require('./utils');
import { runNight, announceDaybreak, revealNightResult } from './night';
import { runDay, maybeTransferSheriffBadge } from './day';
import { runSheriffElection } from './sheriff';
const { shouldRunFirstDaySheriffElection, checkWin } = require('./winCheck');
import { MAX_DAYS } from './constants';
const {
  createTraceContext, flushTrace, markTraceError, markTraceComplete,
  recordSnapshot, recordEvent, recordDecision, startPhaseSpan, endSpan
} = require('../observability');

interface Agent {
  id: number;
  alive?: boolean;
  faction?: string;
  role?: string;
  roleLabel?: string;
  roleConfig?: Record<string, unknown>;
  [key: string]: unknown;
}

interface GameConfig {
  mode: string;
  werewolfMode: string;
  clientViewMode?: string;
  viewerPlayerId?: number;
  host: Record<string, unknown>;
  players: Agent[];
  [key: string]: unknown;
}

interface Round {
  day: number;
  phase?: string;
  sheriffId?: number | null;
  sheriffBadge: { status: string };
  night: Record<string, unknown>;
  speeches: unknown[];
  lastWords: unknown[];
  votes?: Record<string, number>;
  [key: string]: unknown;
}

interface GameEvent {
  type: string;
  [key: string]: unknown;
}

interface ModeConfig {
  id?: string;
  name?: string;
  version?: string;
  background?: string;
  description?: string;
  sheriff?: { enabled?: boolean; firstDayElection?: boolean; voteWeight?: number };
  witch?: Record<string, unknown>;
  hunter?: Record<string, unknown>;
  roles?: unknown[];
  roleMap?: Record<string, Record<string, unknown>>;
  rules?: Record<string, unknown>;
  winCondition?: string;
  enabled?: boolean;
  sortOrder?: number;
  resolvedRoles?: unknown[];
  totalPlayers?: number;
  [key: string]: unknown;
}

interface TraceContext {
  [key: string]: unknown;
}

class WerewolfGameAgent extends BaseGameAgent {
  config: GameConfig;
  options: { onEvent?: (event: GameEvent) => void };
  mode: string;
  modeConfig: ModeConfig;
  roleSkillRegistry: unknown;
  gameId: string;
  trace: TraceContext;
  fallbackAudit: { record: (entry: unknown) => unknown; list: () => unknown[] };
  agents: Agent[];
  audienceSession: AudienceSession;
  hostAgent: unknown;
  rounds: Round[];
  werewolfMode: string;
  winner: string | null;
  winReason: string;

  constructor(config: GameConfig, options: { onEvent?: (event: GameEvent) => void } = {}) {
    if (config.mode !== 'real') throw new Error('全局已禁用 Mock 模式，只支持真实模式。');
    const modeConfig = getWerewolfModeConfig(config.werewolfMode) as unknown as ModeConfig;
    const skillRegistry = createWerewolfSkillRegistry();
    super({ gameType: 'werewolf', skillRegistry });
    this.config = config;
    this.options = options;
    this.mode = 'real';
    this.modeConfig = modeConfig;
    this.roleSkillRegistry = createWerewolfRoleSkillRegistry(this.modeConfig, this.skillRegistry);
    this.gameId = `werewolf-${Date.now()}`;
    this.trace = createTraceContext(this.gameId, 'werewolf', config.werewolfMode);
    this.fallbackAudit = createFallbackAudit(this.gameId, {
      onRecord: (event: unknown) => this.recordFallback(event as GameEvent)
    });
    this.agents = createWerewolfAgents(config, this.modeConfig, this.skillRegistry, this.fallbackAudit, this.gameId, this.roleSkillRegistry);
    this.audienceSession = createAudienceSession(this.agents, config.clientViewMode, config.viewerPlayerId);
    this.hostAgent = new HostAgent(config.host, { onFallback: (entry: unknown) => this.fallbackAudit.record(entry), gameId: this.gameId });
    this.rounds = [];
    this.werewolfMode = config.werewolfMode;
    this.winner = null;
    this.winReason = '';
  }

  buildCtx(): Record<string, unknown> {
    return {
      agents: this.agents,
      rounds: this.rounds,
      modeConfig: this.modeConfig,
      skillRegistry: this.skillRegistry,
      fallbackAudit: this.fallbackAudit,
      state: this as unknown as Record<string, unknown>,
      gameType: 'werewolf',
      emit: (event: GameEvent) => this.emit(event),
      serialize: (patch?: Record<string, unknown>) => this.serialize(patch)
    };
  }

  async run(): Promise<Record<string, unknown>> {
    try {
      recordSnapshot(this.trace, 'game-start', this.serialize(), { phase: 'init' });

      await this.emit({ type: 'players', players: this.serialize().players, game: this.serialize() });

      for (let day = 1; day <= MAX_DAYS && !this.winner; day += 1) {
        const round: Round = createRound(day);
        round.sheriffId = this.getActiveSheriffId();
        round.sheriffBadge.status = round.sheriffId ? 'held' : 'none';
        this.rounds.push(round);
        const ctx = this.buildCtx() as never;

        // Phase: night
        const nightSpan = startPhaseSpan('phase:night', { day, phase: 'night' });
        await runNight(ctx, round as never);
        endSpan(nightSpan);

        // Phase: daybreak
        const daybreakSpan = startPhaseSpan('phase:daybreak', { day, phase: 'daybreak' });
        await announceDaybreak(ctx, round as never);
        endSpan(daybreakSpan);

        // Phase: sheriff election
        if (shouldRunFirstDaySheriffElection(round, this.modeConfig)) {
          const sheriffSpan = startPhaseSpan('phase:sheriff', { day, phase: 'sheriff' });
          await runSheriffElection(ctx, round as never);
          endSpan(sheriffSpan);
        }

        // Phase: night-reveal
        const revealSpan = startPhaseSpan('phase:night-reveal', { day, phase: 'night-reveal' });
        await revealNightResult(ctx, round as never);
        endSpan(revealSpan);

        for (const death of (round.night.deaths || []) as Array<{ id: number; reason: string }>) {
          await maybeTransferSheriffBadge(ctx, round as never, death.id, death.reason, 'night');
        }

        this.applyWinCheck(day, { checkWolfVoteLock: true, sheriffId: round.sheriffId });
        if (this.winner) {
          recordSnapshot(this.trace, `day-${day}-end`, this.serialize(), { day, phase: 'day-end' });
          break;
        }

        // Phase: day
        const daySpan = startPhaseSpan('phase:day', { day, phase: 'day' });
        await runDay(ctx as never, round as never);
        endSpan(daySpan);

        recordSnapshot(this.trace, `day-${day}-end`, this.serialize(), { day, phase: 'day-end' });
        this.applyWinCheck(day);
      }

      if (!this.winner) {
        const aliveWolves = this.agents.filter((agent) => agent.alive && agent.faction === 'wolves').length;
        this.winner = aliveWolves ? 'wolves' : 'good';
        this.winReason = aliveWolves ? '达到最大天数，狼人仍有存活，狼人阵营险胜。' : '达到最大天数，狼人全部出局，好人阵营胜利。';
      }

      const game = this.serialize();
      await this.emit({ type: 'game', game });

      markTraceComplete(this.trace);
      recordSnapshot(this.trace, 'game-end', game, { phase: 'game-end' });

      return game;
    } catch (error) {
      markTraceError(this.trace, (error as Error).message);
      recordSnapshot(this.trace, 'error', this.serialize(), { phase: 'error' });
      throw error;
    } finally {
      flushTrace(this.trace);
    }
  }

  async emit(event: GameEvent): Promise<unknown> {
    // Layer 1: record event immediately
    recordEvent(this.trace, event);

    if (!this.options.onEvent) return undefined;
    const projected = projectWerewolfEvent(event, this.audienceSession as unknown as ProjectionContext);
    return projected ? this.options.onEvent(projected) : undefined;
  }

  recordFallback(event: GameEvent): void {
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
    if (!this.options.onEvent) return;
    const projected = projectWerewolfEvent(event, this.audienceSession as unknown as ProjectionContext);
    this.options.onEvent(projected || event);
  }

  serialize(patch: Record<string, unknown> = {}): Record<string, unknown> {
    const modeDetail = getWerewolfModeConfig(this.werewolfMode) as unknown as ModeConfig;
    const winner = (patch.winner as string | undefined) ?? this.winner;
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
      players: this.agents.map(publicPlayer).sort((a: { id: number }, b: { id: number }) => Number(a.id) - Number(b.id)),
      rounds: this.rounds,
      winner,
      winReason: (patch.winReason as string) ?? this.winReason,
      createdAt: new Date().toISOString()
    };
  }

  getActiveSheriffId(): number | null {
    const previousRound = this.rounds.at(-1);
    const sheriffId = previousRound?.sheriffId;
    return this.agents.some((agent) => agent.alive && Number(agent.id) === Number(sheriffId)) ? sheriffId ?? null : null;
  }

  applyWinCheck(day: number, options: Record<string, unknown> = {}): void {
    const result = checkWin(this.agents, day, this.modeConfig, options);
    this.winner = result.winner;
    this.winReason = result.winReason;
  }
}

async function runWerewolfGame(config: GameConfig, options: { onEvent?: (event: GameEvent) => void } = {}): Promise<Record<string, unknown>> {
  const agent = new WerewolfGameAgent(config, options);
  return agent.run();
}

export { WerewolfGameAgent, runWerewolfGame };
