import './index.css';

interface NightOverlayProps {
  active: boolean;
}

export function NightOverlay({ active }: NightOverlayProps) {
  if (!active) return null;

  return (
    <div className="werewolf-night-overlay" aria-hidden="true">
      <span />
      <span />
    </div>
  );
}
