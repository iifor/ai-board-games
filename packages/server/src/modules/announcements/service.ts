import { werewolfAnnouncements } from '@battle/games';
import { announcementProblem, type AnnouncementItem, type AnnouncementUpdate } from '@battle/shared';
import { badRequest, conflict, notFound } from '../../utils/errors';
import type { announcementRepository } from './repository';
import type { debateTopicAnnouncement } from './debateTopic';

const game = 'werewolf';
const definitions = new Map(werewolfAnnouncements.map(item => [item.key, item]));

export function announcementService(repository: ReturnType<typeof announcementRepository>, debate?: ReturnType<typeof debateTopicAnnouncement>) {
  return {
    async list(): Promise<AnnouncementItem[]> {
      const [stored, topic] = await Promise.all([repository.list(game), debate?.get()]);
      const rows = new Map(stored.map(row => [row.key, row]));
      const items = werewolfAnnouncements.map(definition => {
        const row = rows.get(definition.key);
        return { ...definition, customText: row?.customText ?? null, revision: row?.revision ?? 0 };
      });
      return topic ? [...items, topic] : items;
    },
    preview(key: string, text: string) {
      if (debate && key === debate.key) return { text: debate.preview(text) };
      throw notFound('引擎播报模板');
    },

    async save(key: string, input: AnnouncementUpdate): Promise<AnnouncementItem> {
      if (debate && key === debate.key) return debate.save(input);
      const definition = definitions.get(key);
      if (!definition) throw notFound('播报');
      const source = input.text?.trim() ?? null;
      if (source !== null) {
        const problem = announcementProblem(source, definition.examples);
        if (problem) throw badRequest(problem);
      }
      const custom = source === definition.defaultText ? null : source;
      const row = await repository.save(game, key, custom, input.revision);
      if (!row) throw conflict('这条播报刚被其他管理员修改，请重新打开后再编辑');
      return { ...definition, ...row };
    },

  };
}

export type AnnouncementService = ReturnType<typeof announcementService>;
