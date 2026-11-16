import type { AudienceView, MatchSummaryDto, StageEvent } from '@battle/shared';
import type { StreamConnection } from './types';
import { periodOf, roundLabel } from './utils';

/** LIVE 标记的文字与修饰类：已结束 > 连上 > 自动重连已放弃 > 连接中 */
export function liveBadge(connection: StreamConnection, ended: boolean, replay: boolean): { readonly label: string; readonly className: string } {
  if (ended) return { label: '已结束', className: 'is-ended' };
  if (connection === 'open' || (connection === 'closed' && replay)) return replay ? { label: '回放', className: 'is-replay' } : { label: 'LIVE', className: 'is-live' };
  if (connection === 'lost') return { label: '连接中断', className: 'is-lost' };
  return { label: '连接中', className: '' };
}

/** 玩法模式（板子名）：对局概要优先，其次是视图附带的板子 */
export function matchMode(summary: MatchSummaryDto, view: AudienceView | null): string | null {
  return summary.variantName ?? (typeof view?.extra.board === 'string' ? view.extra.board : null);
}

/** 阶段名：没有中文标题的内部结算阶段（标题就是 id，如 night_resolve）显示为"技能结算" */
export function phaseTitle(view: AudienceView | null): string | undefined {
  const phase = view?.phase;
  return phase?.title === phase?.id && /^[a-z_]+$/.test(phase?.id ?? '') ? '技能结算' : phase?.title;
}

/** 当前阶段文案："第 2 夜 · 狼人请睁眼" / "第 1 轮 · 攻辩"；夜里用公开台词或"法官私讯"代替技术阶段名 */
export function stageStatus(view: AudienceView | null, event: StageEvent | undefined): string {
  const title = phaseTitle(view);
  const night = view?.gameKey === 'werewolf' && periodOf(view) === 'night';
  let step = title;
  if (night && event?.kind === 'phase_started' && event.channel === 'public' && event.announcement) step = event.announcement.replace(/。$/, '');
  if (night && event?.kind === 'narration' && event.channel.startsWith('private:')) step = '法官私讯';
  if (view && step) return `${night ? `第 ${view.round} 夜` : roundLabel(view)} · ${step}`;
  return view?.status === 'completed' ? '对局已结束' : '准备中';
}
