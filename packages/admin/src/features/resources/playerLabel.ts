import type { PlayerDto } from '@battle/shared';

export function playerLabel(player: PlayerDto): string {
  return [player.modelDisplayName ?? '未绑定模型', player.name, '#' + player.id].filter(Boolean).join(' · ');
}
