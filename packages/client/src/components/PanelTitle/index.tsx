import { classNames } from '../../utils/classNames';
import './index.css';

interface PanelTitleProps {
  title: string;
  large?: boolean;
  compact?: boolean;
}

export function PanelTitle({ title, large = false, compact = false }: PanelTitleProps) {
  return (
    <div className={classNames('panel-title', large && 'large', compact && 'compact')}>
      <i />
      <h2>{title}</h2>
      <i />
    </div>
  );
}
