import { playerPortraitKey } from '@battle/shared';

/** poster：完整海报（有背景）；cutout：抠像立绘（透明背景，用于舞台聚光） */
export type PosterVariant = 'poster' | 'cutout';

const DIRECTORY: Readonly<Record<PosterVariant, string>> = { poster: 'player-posters', cutout: 'player-poster-cutouts' };

export const HOST_POSTER = '/player-poster-cutouts/host.webp';

// 模拟玩家没有资源 ID；按生成时的编号配图，旧回放也能显示同一张脸。
const SIMULATED_PORTRAITS = ['doubao', 'grok', 'wenxin', 'gemini', 'kimi', 'deepseek', 'qwen', 'yuanbao', 'xinghuo', 'zhipu', 'chatgpt', 'claude-code', 'meta'] as const;

export function seatPortrait(name: string, variant: PosterVariant = 'poster'): string | null {
  const simulated = /^(\d+) 号模拟玩家$/.exec(name.trim());
  if (!simulated) return resolvePoster(name, null, variant);
  const slug = SIMULATED_PORTRAITS[Number(simulated[1]) - 1];
  return slug ? `/${DIRECTORY[variant]}/${slug}.webp` : null;
}

export function resolvePoster(name: string, avatar: string | null, variant: PosterVariant = 'cutout'): string | null {
  if (name.trim() === '主持人' && !avatar) return HOST_POSTER;
  const slug = playerPortraitKey(name);
  return slug ? `/${DIRECTORY[variant]}/${slug}.webp` : avatar;
}

/** 没有图片时显示的首字（中文取前两个字，英文取前两个字母） */
export function initialsOf(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}
