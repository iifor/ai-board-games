import type { ReactNode } from 'react';
import { initialsOf, resolvePoster, type PosterVariant } from '../utils/posters';
import './Avatar.css';

interface AvatarProps {
  readonly name: string;
  /** 玩家自己的头像；按名字匹配不到内置海报时使用 */
  readonly avatar?: string | null | undefined;
  /** 直接指定图片（如主持人立绘）；给了就不再按名字匹配 */
  readonly src?: string | null | undefined;
  readonly variant?: PosterVariant | undefined;
  /** round：圆形头像（裁切顶部）；figure：立绘（整张贴底居中） */
  readonly shape?: 'round' | 'figure' | undefined;
  /** 没有图片、也取不到首字时显示的内容（如座位号） */
  readonly fallback?: string | undefined;
  readonly className?: string | undefined;
  /** 叠在头像上的内容（如座位号角标） */
  readonly children?: ReactNode;
}

/** 头像：内置海报 → 玩家头像 → 首字。装饰性元素（aria-hidden），名字由旁边的文本承担 */
export function Avatar({ name, avatar = null, src, variant = 'cutout', shape = 'round', fallback, className, children }: AvatarProps) {
  const image = src === undefined ? resolvePoster(name, avatar, variant) : src;
  const classes = ['avatar', `avatar-${shape}`, className].filter(Boolean).join(' ');
  return (
    <span className={classes} aria-hidden="true">
      {image ? <img src={image} alt="" loading="lazy" /> : <b>{initialsOf(name) || fallback}</b>}
      {children}
    </span>
  );
}
