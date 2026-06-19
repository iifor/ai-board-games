import { WerewolfGame } from '../../werewolf/WerewolfGame';
import { WerewolfArenaV2 } from '../components/WerewolfArenaV2';
import './index.css';

interface WerewolfGameV2Props {
  replayGameId?: string;
  onReturnToSelect: () => void;
}

export function WerewolfGameV2({ replayGameId = '', onReturnToSelect }: WerewolfGameV2Props) {
  return (
    <WerewolfGame
      replayGameId={replayGameId}
      onReturnToSelect={onReturnToSelect}
      variant="v2"
      renderArena={(props) => <WerewolfArenaV2 {...props} />}
    />
  );
}
