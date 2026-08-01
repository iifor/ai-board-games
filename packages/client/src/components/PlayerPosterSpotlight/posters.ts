export interface PosterPlayer {
  id?: string | number;
  nickname?: string;
  name?: string;
  avatar?: string;
  avatarUrl?: string;
  avatar_url?: string;
}

export const DEFAULT_HOST_POSTER: PosterPlayer = {
  id: 'default-host',
  nickname: '主持人',
  avatar: '/player-poster-cutouts/host.webp',
};

const POSTER_SLUG_BY_ALIAS: Record<string, string> = {
  doubao: 'doubao',
  豆包: 'doubao',
  grok: 'grok',
  wenxin: 'wenxin',
  文心: 'wenxin',
  文心一言: 'wenxin',
  gemini: 'gemini',
  kimi: 'kimi',
  deepseek: 'deepseek',
  qwen: 'qwen',
  qianwen: 'qwen',
  千问: 'qwen',
  通义: 'qwen',
  通义千问: 'qwen',
  yuanbao: 'yuanbao',
  元宝: 'yuanbao',
  腾讯元宝: 'yuanbao',
  xinghuo: 'xinghuo',
  spark: 'xinghuo',
  星火: 'xinghuo',
  讯飞星火: 'xinghuo',
  zhipu: 'zhipu',
  chatglm: 'zhipu',
  智谱: 'zhipu',
  智谱清言: 'zhipu',
  chatgpt: 'chatgpt',
  claude: 'claude-code',
  claudecode: 'claude-code',
  meta: 'meta',
  metaai: 'meta',
};

export type PlayerPosterVariant = 'poster' | 'cutout';

const POSTER_DIRECTORY_BY_VARIANT: Record<PlayerPosterVariant, string> = {
  poster: 'player-posters',
  cutout: 'player-poster-cutouts',
};

export function getHostPosterPlayer(value?: unknown): PosterPlayer {
  if (!value || typeof value !== 'object') return DEFAULT_HOST_POSTER;
  const host = value as Record<string, unknown>;
  return {
    id: typeof host.id === 'string' || typeof host.id === 'number'
      ? host.id
      : DEFAULT_HOST_POSTER.id,
    nickname: getFirstString(host.nickname, host.name) || DEFAULT_HOST_POSTER.nickname,
    avatar: getFirstString(host.avatar, host.avatarUrl, host.avatar_url) || DEFAULT_HOST_POSTER.avatar,
  };
}

export function isVisualQaHostEnabled(search: string, isDevelopment: boolean): boolean {
  return isDevelopment && new URLSearchParams(search).get('visualQaHost') === '1';
}

export function resolvePlayerPoster(
  player?: PosterPlayer | null,
  variant: PlayerPosterVariant = 'poster',
): string | null {
  const slug = [player?.nickname, player?.name]
    .map(normalizePlayerAlias)
    .map((alias) => POSTER_SLUG_BY_ALIAS[alias])
    .find(Boolean);
  return slug ? `/${POSTER_DIRECTORY_BY_VARIANT[variant]}/${slug}.webp` : null;
}

export function getPosterPlayerName(player?: PosterPlayer | null): string {
  return String(player?.nickname || player?.name || '玩家').trim() || '玩家';
}

export function getPosterPlayerAvatar(player?: PosterPlayer | null): string | null {
  return player?.avatar || player?.avatarUrl || player?.avatar_url || null;
}

function normalizePlayerAlias(value: unknown): string {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s._\-·]/g, '');
}

function getFirstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && Boolean(value));
}
