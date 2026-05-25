import React from 'react';
import { X } from 'lucide-react';
import type { Player } from '../../../types';
import { formatAvatarUrl } from '../../../utils/avatar';
import './index.css';

interface BaseModalProps {
  title?: string;
  eyebrow?: string;
  ariaLabel?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose?: () => void;
  backdropClassName?: string;
  dialogClassName?: string;
  closeClassName?: string;
  titleId?: string;
}

export function BaseModal({
  title,
  eyebrow = '',
  ariaLabel,
  children,
  footer,
  onClose,
  backdropClassName = 'modal-backdrop',
  dialogClassName = 'framed-panel',
  closeClassName = 'modal-close',
  titleId = 'base-modal-title'
}: BaseModalProps) {
  return (
    <div className={backdropClassName} role="presentation" onClick={onClose}>
      <section
        className={dialogClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={ariaLabel || title}
        onClick={(event) => event.stopPropagation()}
      >
        {onClose && (
          <button type="button" className={closeClassName} onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        )}
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        {title && <h2 id={titleId}>{title}</h2>}
        {children}
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
}

interface PlayerAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  player?: Player | null;
  className?: string;
  fallback?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export function PlayerAvatar({ player, className = '', fallback = '', style, children, ...props }: PlayerAvatarProps) {
  const name = player?.nickname || player?.name || fallback || `${player?.id || ''}`;
  const avatar = player?.avatar || player?.avatarUrl || player?.avatar_url || '';
  return (
    <div
      className={className}
      style={avatar ? { ...(style || {}), backgroundImage: `url("${formatAvatarUrl(avatar)}")` } : style}
      aria-label={name ? `${name}头像` : undefined}
      {...props}
    >
      {children || (!avatar ? String(name || '?').slice(0, 1) : null)}
    </div>
  );
}
