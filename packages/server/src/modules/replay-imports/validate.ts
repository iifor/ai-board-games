import type { ReplayDocument, ReplayEntry } from '@battle/shared';
import { badRequest } from '../../utils/errors';

export function validateTimeline({ script, sources }: ReplayDocument, preview: boolean) {
  const seats = new Set<number>(), bindings = new Set<number>(), positions = new Set<string>();
  for (const p of script.players) {
    if (seats.has(p.seat)) throw badRequest(p.seat + ' 号座位重复，请在阵容中校对');
    seats.add(p.seat);
    if (p.playerId && bindings.has(p.playerId)) throw badRequest(p.seat + ' 号绑定了重复的玩家');
    if (p.playerId) bindings.add(p.playerId);
    if (script.gameKey === 'debate') {
      const team = p.team ?? (p.seat <= 4 ? 'pro' : p.seat <= 8 ? 'con' : 'judge');
      if (!['pro','con','judge'].includes(team)) throw badRequest(p.seat + ' 号辩论阵营无效');
      const key = team + '/' + (p.position ?? (p.seat-1)%4+1);
      if (team !== 'judge' && positions.has(key)) throw badRequest(p.seat + ' 号辩位重复');
      positions.add(key);
    }
  }
  if (script.result?.mvp && !seats.has(script.result.mvp)) throw badRequest('result.mvp 引用了不存在的座位');
  let playable = 0;
  const covered = new Set<number>();
  for (const [index,e] of script.events.entries()) {
    const fail = (message: string): never => { throw badRequest('第 ' + (index+1) + ' 条事件（events.' + index + '）' + message); };
    for (const ref of e.sources ?? []) {
      if (ref >= sources.length) fail('原文引用越界');
      covered.add(ref);
    }
    if (e.kind === 'ignored' || preview && e.kind === 'pending') continue;
    if (e.kind === 'pending') fail('尚待处理，请指定用途或忽略');
    const required = (key: 'seat'|'target', kinds: ReplayEntry['kind'][]) => {
      if (kinds.includes(e.kind) && e[key] === undefined) fail('缺少 ' + key);
      if (e[key] !== undefined && !seats.has(e[key]!)) fail(key + ' 引用了不存在的座位');
    };
    required('seat',['speech','judgement','inspect']);
    required('target',['attack','save','poison','inspect','eliminate','reveal','sheriff']);
    if (!e.text.trim()) fail('缺少原文');
    if (['reveal','inspect'].includes(e.kind) && !e.value) fail('缺少身份或查验结果 value');
    if (e.visibility === 'spectator' && ['eliminate','reveal','sheriff','phase'].includes(e.kind)) fail('公开状态结算必须设为公开');
    if (script.gameKey === 'debate' && ['reveal','sheriff','attack','inspect','save','poison','eliminate'].includes(e.kind)) fail('该行动属于狼人杀');
    playable++;
  }
  if (!preview && sources.some((s,i) => s.trim() && !covered.has(i))) throw badRequest('有原文尚未归入时间线，请处理或忽略');
  if (!playable) throw badRequest('请至少添加一条可播放的事件');
}
