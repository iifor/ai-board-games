import { REPLAY_SUGGEST_PROMPT } from './prompt';
import { importEventSchema, type ReplayDocument, type ReplayGame } from '@battle/shared';
import { z } from 'zod';
import { badRequest, upstream } from '../../utils/errors';
import { extractJson, type LlmClient } from '../llm';
import type { ModelService } from '../models/service';
import type { ProviderService } from '../providers/service';
import type { PlayerRepository } from '../players/repository';
import { compileReplay } from './compile';
import { parseReplay } from './parse';
import type { replayRepository } from './repository';

interface Deps {
  toolPrompt: (key: string, fallback: string) => Promise<string>;
  repository: ReturnType<typeof replayRepository>; players: PlayerRepository; models: ModelService;
  providers: Pick<ProviderService,'credentials'>; llm: LlmClient;
}
export function replayService({repository,players,models,providers,llm,toolPrompt}: Deps) {
  return {
    ...repository,
    parse: async (name: string, bytes: Buffer, game: ReplayGame) => parseReplay(name,bytes,game,await players.list()),
    async preview(doc: ReplayDocument, from: number) {
      if (from >= doc.script.events.length) throw badRequest('试播起点不在时间线内');
      const profiles = await players.findMany(doc.script.players.flatMap(p => p.playerId === undefined ? [] : [p.playerId]));
      const { events,start } = compileReplay(doc,profiles,true,from);
      return { events,start };
    },
    async suggest(doc: ReplayDocument, selected: number[], modelId: number) {
      const refs = [...new Set(selected)].sort((a,b) => a-b);
      if (refs.some(i => !doc.sources[i]?.trim())) throw badRequest('请选择有效原文');
      const excerpts = refs.map(i => ({ source:i, text:doc.sources[i] }));
      if (JSON.stringify(excerpts).length > 16000) throw badRequest('每次最多辅助识别 16000 字');
      const model = await models.get(modelId);
      if (!model.enabled) throw badRequest('模型已停用');
      const provider = await providers.credentials(model.providerId);
      const instruction = await toolPrompt('replaySuggest', REPLAY_SUGGEST_PROMPT);
      try {
        const response = await llm.complete({ baseUrl:provider.baseUrl, apiKey:provider.apiKey, model:model.model, temperature:0,
          maxTokens:Math.min(4096, model.maxTokens), timeoutMs:30000, messages:[
            { role:'system',content:instruction },
            { role:'user',content:JSON.stringify({game:doc.script.gameKey,players:doc.script.players.map(({seat,name}) => ({seat,name})),excerpts}) },
          ] });
        const { events } = z.object({events:z.array(importEventSchema).min(1).max(100)}).parse(extractJson(response.content));
        for (const e of events) {
          if (!e.sources?.length || e.sources.some(i => !refs.includes(i)) || !e.sources.map(i => doc.sources[i]).join('\n').includes(e.text) || !e.text.trim()) throw new Error('source mismatch');
        }
        return events.sort((a,b) => a.sources![0]! - b.sources![0]!);
      } catch { throw upstream('模型未返回可核对的候选，请手动整理或重试'); }
    },
  };
}
export type ReplayImportService = ReturnType<typeof replayService>;
