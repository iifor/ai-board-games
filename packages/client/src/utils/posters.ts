// 内置玩家海报（沿用旧版素材）：按玩家名匹配，匹配不到时退回玩家自己的头像。

const SLUG_BY_ALIAS: Readonly<Record<string, string>> = {
  doubao: 'doubao', 豆包: 'doubao',
  grok: 'grok',
  wenxin: 'wenxin', 文心: 'wenxin', 文心一言: 'wenxin',
  gemini: 'gemini',
  kimi: 'kimi',
  deepseek: 'deepseek',
  qwen: 'qwen', qianwen: 'qwen', 千问: 'qwen', 通义: 'qwen', 通义千问: 'qwen',
  yuanbao: 'yuanbao', 元宝: 'yuanbao', 腾讯元宝: 'yuanbao',
  xinghuo: 'xinghuo', spark: 'xinghuo', 星火: 'xinghuo', 讯飞星火: 'xinghuo',
  zhipu: 'zhipu', chatglm: 'zhipu', 智谱: 'zhipu', 智谱清言: 'zhipu',
  chatgpt: 'chatgpt',
  claude: 'claude-code', claudecode: 'claude-code',
  meta: 'meta', metaai: 'meta',
};

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

function normalizeAlias(name: string): string {
  return name.normalize('NFKC').trim().toLowerCase().replace(/[\s._\-·]/g, '');
}

export function resolvePoster(name: string, avatar: string | null, variant: PosterVariant = 'cutout'): string | null {
  if (name.trim() === '主持人' && !avatar) return HOST_POSTER;
  const slug = SLUG_BY_ALIAS[normalizeAlias(name)];
  return slug ? `/${DIRECTORY[variant]}/${slug}.webp` : avatar;
}

/** 没有图片时显示的首字（中文取前两个字，英文取前两个字母） */
export function initialsOf(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}
