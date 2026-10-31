// @battle/engine 公开 API：编写游戏、编译、创建对局、推进、调试输出。

export { compileGame, END_PHASE, RETURN_PHASE, type CompiledGame } from './compiler/compile';
export { scriptedOutput } from './debug/scriptedAgent';
export { EngineInputError, SpecError, TemplateError } from './errors';
export { toChatMessages, type ChatMessage } from './prompt/assemble';
export type { PromptTemplate } from './prompt/template';
export { advance } from './runtime/advance';
export type { Rng } from './runtime/rng';
export { SeatQuery, type SeatRef, type SeatSelection } from './runtime/seats';
export { createSnapshot } from './runtime/setup';
export type {
  AdvanceResult,
  AiAction,
  AiRequest,
  BreakpointSetting,
  CreateMatchInput,
  DebugCommand,
  EngineInput,
  EngineSnapshot,
  EngineStatus,
  JsonSchema,
  LogDraft,
  LogEntry,
  PromptLayers,
  Seat,
  SeatProfile,
  TemplateVars,
} from './runtime/types';
export type { ActDecision, Judgement, PhaseResult, RuleContext, SetupContext, TriggerEvent, TriggerEventKind } from './spec/context';
export { defineGame, definePrompts, speechOutput } from './spec/define';
export type {
  ActPhase,
  AnnouncePhase,
  ComputeOutcome,
  ComputePhase,
  DeclarationSpec,
  JudgePhase,
  NextSpec,
  PhaseSpec,
  RevealPhase,
  SpeakPhase,
  SpeakTurn,
  SpeechOutput,
  Transition,
  VotePhase,
} from './spec/phases';
export { expectResult, findResult } from './spec/results';
export type {
  BudgetSpec,
  DebugSpec,
  EndResult,
  GameOverSpec,
  GameSpec,
  PresentationSpec,
  RoleSpec,
  SetupSpec,
  StateSpec,
  TriggerSpec,
  Visibility,
} from './spec/types';
export { privateChannel, teamChannel } from './visibility/channels';
