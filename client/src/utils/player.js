import { formatAvatarUrl } from './avatar';

export function getPlayerDisplayName(player, fallback = '') {
  if (!player) return fallback || '';
  return player.nickname || player.name || fallback || `${player.id}号`;
}

export function getPlayerAvatar(player) {
  return player?.avatar || player?.avatarUrl || player?.avatar_url || '';
}

export function getPlayerAvatarStyle(player) {
  const avatar = getPlayerAvatar(player);
  return avatar ? { backgroundImage: `url("${formatAvatarUrl(avatar)}")` } : undefined;
}

export function getPlayerInitial(player, fallback = '') {
  return String(getPlayerDisplayName(player, fallback) || '?').slice(0, 1);
}

export function getPlayerModelName(player) {
  return player?.modelName || player?.model || '';
}

export function sortPlayersById(players = []) {
  return [...players].sort((a, b) => Number(a.id) - Number(b.id));
}

export function normalizeHostId(value) {
  const id = Number(value);
  return id > 0 ? id : 'default';
}

export function buildHostOptions(players = [], defaultLabel = '默认主持人') {
  return [
    {
      id: 'default',
      badge: '主',
      name: defaultLabel,
      description: '使用系统默认主持人配置'
    },
    ...sortPlayersById(players).map((player) => ({
      id: Number(player.id),
      badge: player.id,
      name: getPlayerDisplayName(player),
      description: [player.model, player.voicePackageId ? `语音包 ${player.voicePackageId}` : '未绑定语音'].filter(Boolean).join(' · ')
    }))
  ];
}
