/**
 * 游戏事件构建器
 * 提供统一的事件构建接口
 */

import { randomUUID } from 'crypto';
import type {
  GameEvent,
  GameEventType,
  EventMetadata,
  Presentation,
  AudienceCue,
  SerializedGameState,
  PhaseStartPayload,
  ActionRequestedPayload,
  ActionSubmittedPayload,
  SpeechPayload,
  WolfSpeechPayload,
  SelfDestructPayload,
  SkillRequestedPayload,
  SkillThinkingPayload,
  SkillCompletedPayload,
  NightResultPayload,
  VoteResultPayload,
  SheriffEventPayload,
  ErrorPayload
} from '@ai-presenter/shared/types/gameEvent';
import type { ChannelType } from '@ai-presenter/shared/types/channelTypes';
import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';
import { resolveWerewolfPresentation } from './presentation';
import { resolveActionChannel as resolveChannel } from '@ai-presenter/shared/utils/channelResolution';

// ============================================================
// 事件构建器类
// ============================================================

export class GameEventBuilder {
  private matchId: string;
  private stepId: string = '';
  private phase: 'night' | 'day' = 'night';
  private day: number = 1;
  private sequence: number = 0;
  private game: SerializedGameState | null = null;

  constructor(matchId: string) {
    this.matchId = matchId;
  }

  // 设置上下文
  setStep(stepId: string): this {
    this.stepId = stepId;
    return this;
  }

  setPhase(phase: 'night' | 'day'): this {
    this.phase = phase;
    return this;
  }

  setDay(day: number): this {
    this.day = day;
    return this;
  }

  setGame(game: SerializedGameState): this {
    this.game = game;
    return this;
  }

  incrementSequence(): number {
    return ++this.sequence;
  }

  // 构建元数据
  private buildMetadata(): EventMetadata {
    return {
      matchId: this.matchId,
      stepId: this.stepId,
      phase: this.phase,
      day: this.day,
      timestamp: new Date().toISOString(),
      sequence: this.incrementSequence()
    };
  }

  // 构建播报信息
  private buildPresentation(
    type: GameEventType,
    payload: Record<string, unknown>,
    options: { actionType?: string; message?: string; speechText?: string } = {}
  ): Presentation {
    const result = resolveWerewolfPresentation({
      workflowEvent: type,
      eventType: type,
      actionType: options.actionType || String(payload.actionType || ''),
      stepId: this.stepId,
      phase: this.phase,
      message: options.message || String(payload.message || ''),
      speechText: options.speechText || ''
    });

    return {
      speakableText: result.speakableText,
      displayText: result.displayText,
      displayMode: result.displayMode as Presentation['displayMode'],
      uiHint: result.uiHint,
      suppressSpeech: result.suppressSpeech
    };
  }

  // 通用构建方法
  build<T = Record<string, unknown>>(
    type: GameEventType,
    payload: T,
    channel: ChannelType = CHANNEL_TYPES.PUBLIC,
    scopeKey?: string,
    options?: { actionType?: string; message?: string; speechText?: string; audienceCue?: AudienceCue }
  ): GameEvent<T> {
    return {
      id: randomUUID(),
      type,
      channel,
      scopeKey,
      payload,
      metadata: this.buildMetadata(),
      presentation: this.buildPresentation(type, payload as Record<string, unknown>, options),
      audienceCue: options?.audienceCue,
      game: this.game || undefined
    };
  }

  // ============================================================
  // 便捷构建方法
  // ============================================================

  // 阶段事件
  buildPhaseStart(phase: 'night' | 'day', message: string): GameEvent<PhaseStartPayload> {
    return this.build<PhaseStartPayload>(
      'phase-start',
      { phase, message },
      CHANNEL_TYPES.PUBLIC
    );
  }

  // 行动请求事件
  buildActionRequested(
    actionType: string,
    actorIds: number[],
    options: {
      targetIds?: number[];
      optional?: boolean;
      ordered?: boolean;
      actionWindow?: Record<string, unknown>;
      channel?: ChannelType;
      scopeKey?: string;
    } = {}
  ): GameEvent<ActionRequestedPayload> {
    const channel = options.channel || resolveActionChannel(actionType).channel;
    const scopeKey = options.scopeKey || resolveActionChannel(actionType).scopeKey;

    return this.build<ActionRequestedPayload>(
      'action-requested',
      {
        actionType,
        actorIds,
        targetIds: options.targetIds,
        optional: options.optional,
        ordered: options.ordered,
        actionWindow: options.actionWindow
      },
      channel,
      scopeKey,
      { actionType }
    );
  }

  // 行动完成事件
  buildActionSubmitted(
    actionType: string,
    actorId: number,
    options: {
      targetId?: number;
      speech?: SpeechPayload;
      result?: unknown;
      channel?: ChannelType;
      scopeKey?: string;
    } = {}
  ): GameEvent<ActionSubmittedPayload> {
    const channel = options.channel || resolveActionChannel(actionType).channel;
    const scopeKey = options.scopeKey || resolveActionChannel(actionType).scopeKey;

    return this.build<ActionSubmittedPayload>(
      'action-submitted',
      {
        actionType,
        actorId,
        targetId: options.targetId,
        speech: options.speech,
        result: options.result
      },
      channel,
      scopeKey,
      { actionType, speechText: options.speech?.text }
    );
  }

  // 发言事件
  buildSpeech(speech: SpeechPayload): GameEvent<SpeechPayload> {
    return this.build<SpeechPayload>(
      'speech',
      speech,
      CHANNEL_TYPES.PUBLIC,
      undefined,
      { speechText: speech.text }
    );
  }

  // 狼人发言事件
  buildWolfSpeech(speech: WolfSpeechPayload): GameEvent<WolfSpeechPayload> {
    return this.build<WolfSpeechPayload>(
      'wolf-speech',
      speech,
      CHANNEL_TYPES.SCOPE,
      'wolves',
      { actionType: 'wolf_speech', speechText: speech.text }
    );
  }

  // 自爆事件
  buildSelfDestruct(payload: SelfDestructPayload): GameEvent<SelfDestructPayload> {
    return this.build<SelfDestructPayload>(
      'self-destruct',
      payload,
      CHANNEL_TYPES.PUBLIC,
      undefined,
      { speechText: payload.text }
    );
  }

  // Skill 事件
  buildSkillRequested(skillId: string, actorId: number, context: Record<string, unknown>): GameEvent<SkillRequestedPayload> {
    return this.build<SkillRequestedPayload>(
      'skill-requested',
      { skillId, actorId, context },
      CHANNEL_TYPES.SYSTEM
    );
  }

  buildSkillThinking(skillId: string, actorId: number, thinking: string): GameEvent<SkillThinkingPayload> {
    return this.build<SkillThinkingPayload>(
      'skill-thinking',
      { skillId, actorId, thinking },
      CHANNEL_TYPES.SYSTEM
    );
  }

  buildSkillCompleted(skillId: string, actorId: number, result: unknown, duration?: number): GameEvent<SkillCompletedPayload> {
    return this.build<SkillCompletedPayload>(
      'skill-completed',
      { skillId, actorId, result, duration },
      CHANNEL_TYPES.SYSTEM
    );
  }

  // 夜晚结果事件
  buildNightResult(deaths: Array<{ id: number; reason: string }>, message: string): GameEvent<NightResultPayload> {
    return this.build<NightResultPayload>(
      'night-result',
      { deaths, message },
      CHANNEL_TYPES.PUBLIC
    );
  }

  // 投票结果事件
  buildVoteResult(
    votes: Record<string, number>,
    tally: Record<string, number>,
    exile: { id: number; reason?: string } | null,
    message: string
  ): GameEvent<VoteResultPayload> {
    return this.build<VoteResultPayload>(
      'vote-result',
      { votes, tally, exile, message },
      CHANNEL_TYPES.PUBLIC
    );
  }

  // 警长事件
  buildSheriffEvent(type: GameEventType, payload: SheriffEventPayload): GameEvent<SheriffEventPayload> {
    return this.build<SheriffEventPayload>(
      type,
      payload,
      CHANNEL_TYPES.PUBLIC
    );
  }

  // 错误事件
  buildError(code: string, message: string, details?: unknown): GameEvent<ErrorPayload> {
    return this.build<ErrorPayload>(
      'error',
      { code, message, details },
      CHANNEL_TYPES.SYSTEM
    );
  }

  // 狼人睁眼事件
  buildWolfWake(message: string): GameEvent<Record<string, unknown>> {
    return this.build(
      'wolf-wake',
      { message },
      CHANNEL_TYPES.SCOPE,
      'wolves',
      { actionType: 'wolf_speech', message }
    );
  }

  // 预言家睁眼事件
  buildSeerWake(message: string): GameEvent<Record<string, unknown>> {
    return this.build(
      'seer-wake',
      { message },
      CHANNEL_TYPES.SCOPE,
      'seer',
      { actionType: 'seer_check', message }
    );
  }

  // 守卫睁眼事件
  buildGuardWake(message: string): GameEvent<Record<string, unknown>> {
    return this.build(
      'guard-wake',
      { message },
      CHANNEL_TYPES.SCOPE,
      'guard',
      { actionType: 'guard_protect', message }
    );
  }

  // 女巫事件
  buildWitchAntidote(message: string): GameEvent<Record<string, unknown>> {
    return this.build(
      'witch-antidote',
      { message },
      CHANNEL_TYPES.SCOPE,
      'witch',
      { actionType: 'witch_save', message }
    );
  }

  buildWitchPoison(message: string): GameEvent<Record<string, unknown>> {
    return this.build(
      'witch-poison',
      { message },
      CHANNEL_TYPES.SCOPE,
      'witch',
      { actionType: 'witch_poison', message }
    );
  }

  // 遗言事件
  buildLastWords(testimony: { playerId: number; text: string }): GameEvent<Record<string, unknown>> {
    return this.build(
      'last-words',
      { testimony },
      CHANNEL_TYPES.PUBLIC,
      undefined,
      { speechText: testimony.text }
    );
  }

  // 放逐遗言事件
  buildExileWords(testimony: { playerId: number; text: string }): GameEvent<Record<string, unknown>> {
    return this.build(
      'exile-words',
      { testimony },
      CHANNEL_TYPES.PUBLIC,
      undefined,
      { speechText: testimony.text }
    );
  }

  // 警徽事件
  buildSheriffBadgeTransfer(transfer: Record<string, unknown>): GameEvent<Record<string, unknown>> {
    return this.build(
      'sheriff-badge-transfer',
      { sheriffTransfer: transfer },
      CHANNEL_TYPES.PUBLIC
    );
  }

  buildSheriffBadgeTear(transfer: Record<string, unknown>): GameEvent<Record<string, unknown>> {
    return this.build(
      'sheriff-badge-tear',
      { sheriffTransfer: transfer },
      CHANNEL_TYPES.PUBLIC
    );
  }

  // 发言顺序事件
  buildSpeechOrder(): GameEvent<Record<string, unknown>> {
    return this.build(
      'speech-order',
      {},
      CHANNEL_TYPES.PUBLIC
    );
  }

  // 游戏结束事件
  buildGameEnd(winner: string, winReason: string): GameEvent<Record<string, unknown>> {
    return this.build(
      'game-end',
      { winner, winReason },
      CHANNEL_TYPES.PUBLIC
    );
  }

  // 工作流完成事件
  buildWorkflowCompleted(message: string): GameEvent<Record<string, unknown>> {
    return this.build(
      'workflow-completed',
      { message },
      CHANNEL_TYPES.PUBLIC
    );
  }
}

// ============================================================
// 辅助函数
// ============================================================

function resolveActionChannel(actionType: string): { channel: ChannelType; scopeKey?: string } {
  return resolveChannel(actionType);
}

// ============================================================
// 工厂函数
// ============================================================

export function createGameEventBuilder(matchId: string): GameEventBuilder {
  return new GameEventBuilder(matchId);
}
