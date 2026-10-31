import type { CompiledGame } from '../compiler/compile';
import type { EngineSnapshot, JsonSchema, PromptLayers, Seat, TemplateVars } from '../runtime/types';
import { describeOutputContract } from '../ai/outputContract';
import { formatHistory } from './history';
import { platformContract } from './platform';
import { renderTemplate, type PromptTemplate } from './template';
import { buildSeatContext } from './visibleContext';

export interface AssembleInput {
  readonly viewer: Seat;
  readonly instruction: PromptTemplate;
  readonly vars: TemplateVars;
  readonly legalTargets: readonly number[] | null;
  readonly outputSchema: JsonSchema;
  readonly previousError: string | null;
}

export function assemblePrompt(game: CompiledGame, s: EngineSnapshot, input: AssembleInput): PromptLayers {
  const context = buildSeatContext(game, s, input.viewer, { turn: input.vars, legalTargets: input.legalTargets });
  const role = game.spec.roles[input.viewer.role];
  if (!role) throw new Error(`座位 ${input.viewer.seat} 的角色 ${input.viewer.role} 未定义`);
  const persona = input.viewer.profile.persona.trim();
  const identity = renderTemplate(role.identity, context);
  return {
    platform: platformContract(game.spec.title),
    rules: renderTemplate(game.spec.rulesText, context),
    identity: persona ? `${identity}\n\n你的人设：${persona}` : identity,
    history: formatHistory(game, s, input.viewer),
    instruction: renderTemplate(input.instruction, context),
    output: describeOutputContract(input.outputSchema, input.legalTargets, input.previousError),
  };
}

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
