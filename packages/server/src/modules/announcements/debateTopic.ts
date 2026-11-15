import { buildPublicContext, collectTemplatePaths, createSnapshot, parseTemplate, renderTemplate, TemplateError, type CompiledGame } from '@battle/engine';
import type { AnnouncementItem, AnnouncementUpdate } from '@battle/shared';
import type { promptSettingsRepository } from '../prompt-catalog/settingsRepository';
import { badRequest, conflict } from '../../utils/errors';

// 使用原有配置键、修订号和引擎模板语法，使已保存的辩题文案继续生效。
export function debateTopicAnnouncement(game: CompiledGame, settings: ReturnType<typeof promptSettingsRepository>) {
  const phase = game.spec.phases.topic_reveal;
  if (phase?.kind !== 'announce') throw new Error('缺少辩题公布阶段');
  const template = phase.text;
  const key = game.spec.key + '.' + template.name;
  const players = Array.from({ length: game.spec.players.min }, (_, i) => ({
    playerId: String(i + 1), name: '示例玩家' + (i + 1), persona: '', avatar: null,
  }));
  const snapshot = createSnapshot(game, { players, seed: 41 });
  snapshot.cursor.phaseId = game.spec.start;
  const context = buildPublicContext(game, snapshot);
  const examples = Object.fromEntries(collectTemplatePaths(template).map(({ path }) =>
    [path, renderTemplate(parseTemplate(template.name, '{{' + path + '}}'), context)]));
  const definition = { key, title: phase.title ?? '辩题公布', group: '辩论赛开场', audience: 'public' as const,
    defaultText: template.source, examples, engineTemplate: true as const };

  function preview(source: string) {
    const tags = source.match(/\{\{[^{}]*\}\}/g) ?? [];
    if (tags.length > 128 || source.replace(/\{\{[^{}]*\}\}/g, '').includes('{{')) throw badRequest('模板标签未闭合或数量超过 128');
    try {
      const text = renderTemplate(parseTemplate(template.name, source), context, 32000);
      if (!text) throw badRequest('播报文案在示例中渲染为空');
      return text;
    } catch (error) {
      if (error instanceof TemplateError) throw badRequest(error.message);
      throw error;
    }
  }
  function item(source: string, revision: number): AnnouncementItem {
    return { ...definition, customText: source === template.source ? null : source, revision };
  }
  return { key, preview,
    async get() {
      const row = await settings.get(game.spec.key, template.name);
      return item(row?.source ?? template.source, row?.revision ?? 0);
    },
    async save(input: AnnouncementUpdate) {
      const source = input.text?.trim() ?? template.source;
      preview(source);
      const row = await settings.save(game.spec.key, template.name, source, input.revision);
      if (!row) throw conflict('这条播报刚被其他管理员修改，请重新打开后再编辑');
      return item(source, row.revision);
    },
  };
}
