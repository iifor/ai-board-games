import type { ReplayDocument, ReplayDraft, ReplayDraftSummary, ReplayEntry, ReplayGame, ReplayPreview } from '@battle/shared';
import { http } from './http';

const base = '/api/admin/replay-imports';
export const replayApi = {
  list: () => http.get<ReplayDraftSummary[]>(base),
  get: (id: string) => http.get<ReplayDraft>(base+'/'+id),
  parse(file: File, gameKey: ReplayGame) {
    const form = new FormData();
    form.set('file',file); form.set('gameKey',gameKey);
    return http.post<ReplayDocument>(base+'/parse',form);
  },
  save: (document: ReplayDocument, draft: ReplayDraft | null) => draft
    ? http.put<ReplayDraft>(base+'/'+draft.id,{ document, revision:draft.revision }) : http.post<ReplayDraft>(base,document),
  preview:(document: ReplayDocument, from: number) => http.post<ReplayPreview>(base+'/preview',{ document,from }),
  suggest:(document: ReplayDocument, selected: number[], modelId: number) => http.post<ReplayEntry[]>(base+'/suggest',{document,selected,modelId}),
  publish:(draft: ReplayDraft) => http.post<{matchId:string}>(base+'/'+draft.id+'/publish',{ revision:draft.revision }),
};
