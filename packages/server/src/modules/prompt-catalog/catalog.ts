import { collectTemplatePaths, parseTemplate, platformContract, playerExpression, type CompiledGame, type PromptTemplate } from '@battle/engine';
import type { PromptCatalogItem } from '@battle/shared';
import { TEST_PROMPT } from '../models/constants';
import { REPLAY_SUGGEST_PROMPT } from '../replay-imports/prompt';

export interface CatalogEntry {
  item: PromptCatalogItem;
  template: PromptTemplate;
  game?: CompiledGame;
  role?: string;
  phase?: string;
}

function gameEntry(game: CompiledGame, template: PromptTemplate): CatalogEntry | undefined {
  const { spec } = game;
  const key = template.name;
  const roles = Object.entries(spec.roles).filter(([, role]) => role.identity === template);
  const phases = Object.entries(spec.phases).filter(([, phase]) =>
    ('prompt' in phase && phase.prompt === template) || (phase.kind === 'speak' && (
      phase.followUp?.prompt === template || Object.values(phase.declarations ?? {}).some(d => d.listenerPrompt === template)
    )));
  // 攻辩回答使用轮次覆盖模板，属于同一个攻辩阶段。
  if (spec.key === 'debate' && key === 'crossfireAnswer' && spec.phases.crossfire) phases.push(['crossfire', spec.phases.crossfire]);
  const phase = phases[0]?.[1];
  if (template !== spec.rulesText && !roles.length && !phase) return;
  const kind = template === spec.rulesText ? '游戏规则' : roles.length ? '角色身份' : '阶段任务';
  const label = spec.key === 'debate' && key === 'crossfireQuestion' ? '攻辩提问'
    : spec.key === 'debate' && key === 'crossfireAnswer' ? '攻辩回答'
    : key === 'wolfChatReply' ? '狼人夜聊 · 配合确认'
    : key === 'selfDestructDecision' ? '旁听发言 · 自爆决定' : null;
  const usage = [...roles.map(([, role]) => role.name), ...phases.flatMap(([id, p]) => [p.title ?? ('action' in p ? p.action : id), id])];
  const title = label ?? usage[0] ?? (kind === '游戏规则' ? kind : key);
  return { game, template, ...(roles[0] && { role: roles[0][0] }), ...(phases[0] && { phase: phases[0][0] }),
    item: { group: spec.key, groupTitle: spec.title, key, title, kind, usage: [...new Set(usage)],
      variables: [...new Set(collectTemplatePaths(template).map(p => p.path))],
      pilot: (spec.key === 'werewolf' && key === 'daySpeech') || (spec.key === 'debate' && key === 'crossfireQuestion') } };
}

export function catalogEntries(registry: ReadonlyMap<string, CompiledGame>): CatalogEntry[] {
  const entries = [...registry.values()].flatMap(game =>
    [...game.prompts.values()].map(t => gameEntry(game, t)).filter((e): e is CatalogEntry => e !== undefined));
  for (const [key, title, source, kind] of [
    ['platform', '玩家平台契约', platformContract('{{title}}'), '平台契约'],
    ['playerExpression', '玩家发言与情绪表达', playerExpression, '平台契约'],
    ['replaySuggest', '剧本导入 · 原文识别', REPLAY_SUGGEST_PROMPT, '工具指令'],
    ['modelTest', '模型连接测试', TEST_PROMPT, '工具指令'],
  ] as const) {
    const template = parseTemplate(key, source);
    entries.push({ template, item: { group: 'system', groupTitle: '平台与工具', key, title,
      kind, variables: key === 'platform' ? ['title'] : [], usage: key === 'playerExpression' ? ['玩家发言', '评委点评'] : [], pilot: false } });
  }
  return entries.sort((a, b) => Number(b.item.pilot) - Number(a.item.pilot));
}
