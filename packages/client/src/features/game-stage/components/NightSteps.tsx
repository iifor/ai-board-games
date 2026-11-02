import './NightSteps.css';

/** 夜晚行动顺序：本轮夜晚已走过的阶段（只用公开的阶段标题），当前阶段高亮。只展示，不做 live region */
export function NightSteps({ steps }: { readonly steps: readonly string[] }) {
  if (!steps.length) return null;
  const last = steps.length - 1;
  return (
    <div className="night-steps glass-panel" role="group" aria-label="夜晚行动顺序">
      <i className="night-steps-eye" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </i>
      <ol>
        {steps.map((step, index) => (
          <li key={`${index}-${step}`} className={index === last ? 'ui-pill is-current' : 'is-done'}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
