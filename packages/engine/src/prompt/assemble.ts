import type { CompiledGame } from '../compiler/compile';
import type { AiAction, AiRequest, EngineSnapshot, JsonSchema, PromptLayers, Seat, TemplateVars } from '../runtime/types';
import { describeOutputContract } from '../ai/outputContract';
import { formatHistory } from './history';
import { platformContract } from './platform';
import { playerExpression } from './playerExpression';
import { parseTemplate, type PromptTemplate } from './template';
import { renderMatchTemplate } from './matchTemplates';
import { buildSeatContext } from './visibleContext';

export interface AssembleInput {
  readonly action: AiAction;
  readonly onFallback?: (name: string) => void;
  readonly viewer: Seat;
  readonly instruction: PromptTemplate;
  readonly vars: TemplateVars;
  readonly legalTargets: readonly number[] | null;
  readonly outputSchema: JsonSchema;
  readonly previousError: string | null;
}

export function assemblePrompt(game: CompiledGame, s: EngineSnapshot, input: AssembleInput): {
  prompt: PromptLayers; taskTemplate: NonNullable<AiRequest['taskTemplate']>;
} {
  const context = buildSeatContext(game, s, input.viewer, { turn: input.vars, legalTargets: input.legalTargets });
  const role = game.spec.roles[input.viewer.role];
  if (!role) throw new Error(`座位 ${input.viewer.seat} 的角色 ${input.viewer.role} 未定义`);
  const persona = input.viewer.profile.persona.trim();
  const pinned = s.promptSet;
  const render = (template: PromptTemplate) => renderMatchTemplate(template, pinned?.sources[template.name], context, input.onFallback);
  const identity = render(role.identity).text;
  const base = render(input.instruction);
  const trial = pinned?.trials[input.instruction.name];
  const instruction = trial ? renderMatchTemplate(parseTemplate(input.instruction.name, base.source), trial.source,
    { ...context, originalTask: base.text }, input.onFallback) : base;
  const applied = trial && instruction.source === trial.source ? trial : undefined;
  const effectivePersona = applied?.persona ?? persona;
  return {
    taskTemplate: { name: input.instruction.name, source: base.source, context, originalTask: base.text, persona,
      ...(applied && { applied }) },
    prompt: {
      platform: renderMatchTemplate(platformTemplate, pinned?.platform, { title: game.spec.title }, input.onFallback).text,
      rules: render(game.spec.rulesText).text,
      identity: [
        identity,
        (input.action === 'speak' || input.action === 'judge')
          && renderMatchTemplate(expressionTemplate, pinned?.playerExpression, {}, input.onFallback).text,
        effectivePersona && `你的人设：${effectivePersona}`,
      ].filter(Boolean).join('\n\n'),
      history: formatHistory(game, s, input.viewer),
      instruction: instruction.text,
      output: describeOutputContract(input.outputSchema, input.legalTargets, input.previousError),
    },
  };
}

const platformTemplate = parseTemplate('platform', platformContract('{{title}}'));
const expressionTemplate = parseTemplate('playerExpression', playerExpression);

export interface ChatMessage {
  readonly role: 'system' | 'user';
  readonly content: string;
}

/** 推荐的消息排布：L1–L3 作为 system，L4–L6 作为 user */
export function toChatMessages(layers: PromptLayers): ChatMessage[] {
  return [
    { role: 'system', content: [layers.platform, layers.rules, layers.identity].join('\n\n') },
    {
      role: 'user',
      content: [`对局记录：\n${layers.history}`, `当前任务：\n${layers.instruction}`, layers.output].join('\n\n'),
    },
  ];
}
