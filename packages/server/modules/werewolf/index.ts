const { PlayerAgent } = require('./playerAgent');
import * as constants from './constants';
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

module.exports = {
  PlayerAgent,
  ...workflow,
  ...constants,
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
