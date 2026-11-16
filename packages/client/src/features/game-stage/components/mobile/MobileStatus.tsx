import type { AudienceView } from '@battle/shared';
import { aliveSummary } from '../../utils';
import './MobileStatus.css';

/** 狼人杀局势条：存活人数、观众能看到阵营时各阵营存活人数、警长 */
export function MobileStatus({ view }: { readonly view: AudienceView }) {
  const summary = aliveSummary(view);
  const sheriff = typeof view.extra.sheriff === 'number' ? view.extra.sheriff : null;
  return (
    <p className="mobile-status" aria-label="局势">
      <span>存活 <b>{summary.alive}</b>/{summary.total}</span>
      {summary.camps.map((camp) => (
        <span key={camp.team} data-team={camp.team}>{camp.label} <b>{camp.alive}</b></span>
      ))}
      {sheriff !== null ? <span className="mobile-status-sheriff">警长 <b>{sheriff}号</b></span> : null}
    </p>
  );
}
