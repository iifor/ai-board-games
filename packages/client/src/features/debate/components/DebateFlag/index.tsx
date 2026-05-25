import './index.css';

interface DebateFlagProps {
  tone: string;
  label: string;
}

export function DebateFlag({ tone, label }: DebateFlagProps) {
  return (
    <span className={`debate-flag ${tone}`} aria-hidden="true">
      <svg viewBox="0 0 78 98" role="img">
        <path className="flag-back" d="M10 5H68V68L39 91L10 68V5Z" />
        <path className="flag-line" d="M17 13H61V63L39 81L17 63V13Z" />
        <path className="flag-top" d="M5 5H73M39 0V10" />
      </svg>
      <b>{label}</b>
    </span>
  );
}
