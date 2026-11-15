import { parseTemplate, renderTemplate, TemplateError, type AiRequest, type CompiledGame } from '@battle/engine';
import type { CatalogComparison, CatalogPreview, PromptCatalogDetail, PromptExampleRef } from '@battle/shared';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { runPromptTrials, trialSettings, type TrialDependencies } from '../traces/promptTrials';
import { catalogEntries, type CatalogEntry } from './catalog';
import { builtInExamples, type Example } from './examples';
import type { catalogRepository } from './repository';

interface Sample { source: string | null; rendered: string; request?: AiRequest; context?: Readonly<Record<string, unknown>> }

function renderDraft(name: string, source: string, selected: Sample, forCatalog = false) {
  const saved = selected.request?.taskTemplate;
  const context = saved && !forCatalog ? { ...saved.context, originalTask: saved.originalTask } : saved?.context ?? selected.context;
  if (!context || selected.source === null) throw badRequest('这条历史请求只保留了最终文本。请选择内置样例编辑草稿。');
  // 限制可编辑模板的复杂度，并拒绝被解析器当作普通文本的不完整标签。
  const tags = source.match(/\{\{[^{}]*\}\}/g) ?? [];
  if (tags.length > 128 || source.replace(/\{\{[^{}]*\}\}/g, '').includes('{{')) throw badRequest('模板标签未闭合或数量超过 128');
  try {
    const result = renderTemplate(parseTemplate(name, source), context, 32000);
    if (!result) throw badRequest('草稿在此样例中渲染为空');
    return result;
  } catch (error) {
    if (error instanceof TemplateError) throw badRequest(error.message);
    throw error;
  }
}

export function catalogService(registry: ReadonlyMap<string, CompiledGame>, repository: ReturnType<typeof catalogRepository>, trials: TrialDependencies) {
  const entries = catalogEntries(registry);
  const cache = new Map<CatalogEntry, Example[]>();
  function examples(entry: CatalogEntry) {
    const saved = cache.get(entry);
    if (saved) return saved;
    const result = builtInExamples(entry, registry);
    cache.set(entry, result);
    return result;
  }
  function find(group: string, key: string) {
    const entry = entries.find(e => e.item.group === group && e.item.key === key);
    if (!entry) throw notFound('提示词模板');
    return entry;
  }
  async function setting(entry: CatalogEntry) {
    const { group, key } = entry.item;
    return await repository.get(group, key) ?? { source: entry.template.source, revision: 0 };
  }
  async function sample(entry: CatalogEntry, ref: PromptExampleRef): Promise<Sample> {
    if (ref.kind === 'example') {
      const example = examples(entry)[ref.index];
      if (!example) throw notFound('内置样例');
      const current = await setting(entry);
      const base = { ...example, source: current.source };
      if (current.source === entry.template.source) return base;
      const rendered = renderDraft(entry.item.key, current.source, base, true);
      if (!('request' in example)) return { ...base, rendered };
      const request = { ...example.request, prompt: { ...example.request.prompt, instruction: rendered } };
      return { ...base, rendered, request };
    }
    const { request, gameKey, name } = await repository.source(ref.matchId, ref.requestId);
    if (gameKey !== entry.item.group || name !== entry.item.key) throw notFound('该模板的历史请求');
    return { request, source: request.taskTemplate?.applied?.source ?? request.taskTemplate?.source ?? null, rendered: request.prompt.instruction };
  }
  return {
    list: () => entries.map(e => e.item),
    async save(group: string, key: string, source: string, revision: number) {
      const entry = find(group, key);
      const samples = examples(entry);
      if (!samples.length) throw badRequest('该模板缺少可用于校验的上下文');
      for (const sample of samples) renderDraft(key, source, { ...sample, source: entry.template.source }, true);
      const saved = await repository.save(group, key, source, revision);
      if (!saved) throw conflict('模板已被其他管理员修改，请重新打开后再保存');
      return saved;
    },
    async detail(group: string, key: string): Promise<PromptCatalogDetail> {
      const entry = find(group, key);
      const options: PromptCatalogDetail['examples'] = examples(entry).map((s, index) => ({ label: s.label, ref: { kind: 'example', index } }));
      if (entry.item.kind === '阶段任务') {
        for (const row of await repository.recent(group, key)) {
          const requestId = row.requestIds[0];
          if (requestId) options.push({ label: `${row.scripted ? '历史脚本局' : '历史模型局'} · ${row.matchId.slice(0, 8)} · 第 ${row.round} 轮 · ${row.seat} 号 · ${requestId}`,
            ref: { kind: 'history', matchId: row.matchId, requestId } });
        }
      }
      return { item: entry.item, ...await setting(entry), defaultSource: entry.template.source, examples: options };
    },
    async preview(group: string, key: string, ref: PromptExampleRef, source?: string): Promise<CatalogPreview> {
      const entry = find(group, key);
      const selected = await sample(entry, ref);
      return { rendered: selected.rendered, source: selected.source, draft: source === undefined ? null : renderDraft(key, source, selected, ref.kind === 'example'),
        ...(selected.request && { layers: { ...selected.request.prompt } }) };
    },
    async compare(group: string, key: string, ref: PromptExampleRef, source: string, model: number): Promise<CatalogComparison> {
      const entry = find(group, key);
      if (!entry.item.pilot) throw badRequest('模型对比仅开放狼人杀白天发言与辩论攻辩提问');
      const selected = await sample(entry, ref);
      const request = selected.request;
      if (!request) throw badRequest('请选择带模型请求的样例进行对比');
      const draft = renderDraft(key, source, selected);
      if (draft === selected.rendered) throw badRequest('草稿在此样例的渲染结果与原版相同');
      const settings = await trialSettings(trials.models, model, request);
      const result = await runPromptTrials(trials, settings, request, { ...request.prompt, instruction: draft });
      // 对比期间原调用链可能被删除；交付前重新检查其可读性。
      if (ref.kind === 'history') await sample(entry, ref);
      return { ...result, rendered: selected.rendered, draft };
    },
  };
}
export type CatalogService = ReturnType<typeof catalogService>;
