/**
 * EventBus 交付订阅器
 * 替代传统 flushOutbox → projectWorkflowOutboxEvent 的交付路径，
 * 直接从 EventBus 订阅 GameEvent 并调用 sender.enqueue()。
 *
 * Phase 5 引入，Phase 6 与 ChannelRouter/AudienceStream 集成。
 */

import type { GameEvent } from '@ai-presenter/shared/types/gameEvent';
import type { WerewolfEventBus } from './eventBus';

type DeliveryCallback = (event: Record<string, unknown>) => void | Promise<void>;

// ============================================================
// EventDeliverySubscriber
// ============================================================

export class EventDeliverySubscriber {
  private eventBus: WerewolfEventBus;
  private deliver: DeliveryCallback;
  private unsubscribe: (() => void) | null = null;
  private errorCount = 0;

  constructor(eventBus: WerewolfEventBus, deliver: DeliveryCallback) {
    this.eventBus = eventBus;
    this.deliver = deliver;
  }

  /** 启动订阅 */
  start(): void {
    this.unsubscribe = this.eventBus.subscribeAll(async (event: GameEvent) => {
      try {
        const flatEvent = this.toFlatEvent(event);
        await Promise.resolve(this.deliver(flatEvent));
      } catch (error) {
        this.errorCount++;
        console.error(
          `[EventDelivery] 事件交付失败 (${event.type}):`,
          (error as Error).message,
        );
      }
    });
  }

  /** 停止订阅 */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /** 获取错误数 */
  getErrorCount(): number {
    return this.errorCount;
  }

  // ----------------------------------------------------------
  // 转换
  // ----------------------------------------------------------

  private toFlatEvent(event: GameEvent): Record<string, unknown> {
    const payload = event.payload as Record<string, unknown>;
    // 发言 + 警长类事件保留原始 type，不包装为 workflow-event
    const isSpeech =
      event.type === 'speech' ||
      event.type === 'wolf-speech' ||
      event.type === 'self-destruct';
    const isSheriff = event.type.startsWith('sheriff-');
    const keepOriginalType = isSpeech || isSheriff;

    // action-submitted 事件的 speech 嵌套在 payload.speech 中
    const nestedSpeech = payload.speech as Record<string, unknown> | undefined;
    const hasSpeech = isSpeech
      || payload.playerId !== undefined
      || (nestedSpeech && typeof nestedSpeech === 'object' && (nestedSpeech.playerId || nestedSpeech.text));

    const flat: Record<string, unknown> = {
      type: keepOriginalType ? event.type : 'workflow-event',
      matchId: event.metadata.matchId,
      workflowEvent: event.type,
      actionType: String(payload.actionType || ''),
      message: event.presentation?.speakableText ||
        String(payload.message || payload.text || ''),
      channel: event.channel,
      scopeKey: event.scopeKey,
      presentation: event.presentation ? { ...event.presentation } : {},
      audienceCue: event.audienceCue ? { ...event.audienceCue } : undefined,
      metadata: event.metadata ? { ...event.metadata } : {},
    };

    if (event.game) {
      flat.game = event.game;
      // 从 game snapshot 提取警长候选人 ID（供 C 端举手图标使用）
      const gameRounds = (event.game as unknown as { rounds?: Array<Record<string, unknown>> }).rounds;
      if (Array.isArray(gameRounds) && gameRounds.length > 0) {
        const latestRound = gameRounds[gameRounds.length - 1];
        const sheriffElection = latestRound?.sheriffElection as Record<string, unknown> | undefined;
        if (sheriffElection) {
          const signedUp = Array.isArray(sheriffElection.signedUpIds)
            ? (sheriffElection.signedUpIds as number[])
            : [];
          const candidates = Array.isArray(sheriffElection.candidates)
            ? (sheriffElection.candidates as number[])
            : [];
          flat.sheriffCandidateIds = signedUp.length > 0 ? signedUp : candidates;
        }
      }
    }

    if (hasSpeech) {
      flat.speech = {
        playerId: nestedSpeech?.playerId || payload.playerId || payload.actorId,
        text: (nestedSpeech?.text || payload.text || '') as string,
        thinking: (nestedSpeech?.thinking || payload.thinking || '') as string,
      };
    }

    if (payload.actionWindow) {
      flat.actionWindow = payload.actionWindow;
    }

    if (payload.text !== undefined) {
      flat.text = payload.text;
    }

    if (payload.targetId !== undefined) {
      flat.targetId = payload.targetId;
    }

    return flat;
  }
}

// ============================================================
// 工厂函数
// ============================================================

export function createEventDeliverySubscriber(
  eventBus: WerewolfEventBus,
  deliver: DeliveryCallback,
): EventDeliverySubscriber {
  return new EventDeliverySubscriber(eventBus, deliver);
}
