import { DebateGame } from '../../debate/DebateGame';
import './index.css';

interface DebateGameV2Props {
  replayGameId?: string;
  onReturnToSelect: () => void;
}

export function DebateGameV2({ replayGameId = '', onReturnToSelect }: DebateGameV2Props) {
  return <DebateGame replayGameId={replayGameId} onReturnToSelect={onReturnToSelect} variant="v2" />;
}
