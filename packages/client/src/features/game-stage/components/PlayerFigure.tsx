import type { AudienceSeat } from '@battle/shared';
import { useState } from 'react';
import { seatPortrait } from '../../../utils/posters';

interface PlayerFigureProps {
  readonly seat: Pick<AudienceSeat, 'name' | 'avatar' | 'appearanceName'>;
  readonly className: string;
  /** cutout：原图（中央发言大图）；figure：小图（圆桌座位） */
  readonly size?: 'cutout' | 'figure';
}

/** 只使用玩家的公开形象；自定义头像作为没有专属立绘时的替代图。 */
export function PlayerFigure({ seat, className, size = 'cutout' }: PlayerFigureProps) {
  const [failed, setFailed] = useState<readonly string[]>([]);
  const cutout = seatPortrait(seat.appearanceName ?? seat.name, size);
  const src = [cutout, seat.avatar].find((url) => url && !failed.includes(url));
  if (!src) return null;
  return <img key={src} className={className} data-art={src === cutout ? 'cutout' : 'portrait'} src={src}
    alt="" aria-hidden="true" draggable={false} onError={() => setFailed((urls) => [...urls, src])} />;
}
