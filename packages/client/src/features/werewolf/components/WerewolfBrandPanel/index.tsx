import type { GameState, WerewolfMode } from '../../../../types';
import './index.css';

interface WerewolfBrandPanelProps {
  game: GameState;
  mode: WerewolfMode | null;
  showRoles: boolean;
  onShowRolesChange: (value: boolean | ((prev: boolean) => boolean)) => void;
}

export function WerewolfBrandPanel({ game, mode, showRoles, onShowRolesChange }: WerewolfBrandPanelProps) {
  const playerPerspective = game?.clientViewMode === 'player';
  return (
    <section className="werewolf-title-panel">
      <p>AI 狼人杀</p>
      <div>
        <span>{mode?.name || (game.event as Record<string, unknown>)?.name as string}</span>
        <span onClick={() => !playerPerspective && onShowRolesChange((value: boolean) => !value)}>
          <span>{playerPerspective ? '玩家视角' : showRoles ? '上帝视角' : '隐藏身份'}</span>
        </span>
      </div>
    </section>
  );
}
