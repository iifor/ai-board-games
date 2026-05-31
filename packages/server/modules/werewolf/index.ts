import { PlayerAgent } from './playerAgent';
import * as workflow from './workflow';
import { WerewolfEventBus, createEventBus, createEventBusWithDefaults } from './eventBus';
import { GameEventBuilder, createGameEventBuilder } from './gameEventBuilder';
import { ChannelRouter, ViewerContextBuilder, createChannelRouter } from './channelRouter';
import { AudienceStream, createAudienceStream } from './audienceStream';
import {
  GOD_VIEW_OPTIONS,
  AUDIENCE_VIEW_OPTIONS,
  SPEECH_ONLY_OPTIONS,
  createPlayerViewOptions,
  createWolfViewOptions,
  createSeerViewOptions,
  createWitchViewOptions,
  createGuardViewOptions,
} from './audienceOptions';
import { EventDeliverySubscriber, createEventDeliverySubscriber } from './eventDeliverySubscriber';

workflow.registerWerewolfWorkflow();

// Re-export workflow members
export {
  WEREWOLF_WORKFLOW_ID,
  werewolfWorkflow,
  registerWerewolfWorkflow,
  createWerewolfWorkflowMatch,
  runWerewolfWorkflow,
  serializeWerewolfState,
} from './workflow';

export {
  WEREWOLF_GAME_DEFINITION_VERSION,
  WEREWOLF_GAME_DEFINITION,
  werewolfChannelPolicy,
  createWerewolfGameDefinition,
  createWerewolfEffectsFromAction,
} from './definition';

// Re-export constants
export {
  MAX_DAYS,
  FACTION_GOOD,
  FACTION_WOLVES,
  ROLE_TYPE_GOD,
  ROLE_TYPE_WOLF,
  ROLE_TYPE_VILLAGER,
  EXECUTABLE_WEREWOLF_ACTIONS,
} from './constants';

export {
  PlayerAgent,
  // Phase 2-6: 事件驱动架构组件
  WerewolfEventBus,
  createEventBus,
  createEventBusWithDefaults,
  GameEventBuilder,
  createGameEventBuilder,
  ChannelRouter,
  ViewerContextBuilder,
  createChannelRouter,
  AudienceStream,
  createAudienceStream,
  EventDeliverySubscriber,
  createEventDeliverySubscriber,
  // 观众预设
  GOD_VIEW_OPTIONS,
  AUDIENCE_VIEW_OPTIONS,
  SPEECH_ONLY_OPTIONS,
  createPlayerViewOptions,
  createWolfViewOptions,
  createSeerViewOptions,
  createWitchViewOptions,
  createGuardViewOptions,
};
