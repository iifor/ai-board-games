import { Check, Eye, Moon, UserRound, Users } from 'lucide-react';
import { classNames } from '../../../../utils/classNames';
import { formatWerewolfModeSummary, getWerewolfModePlayerCount } from '../../utils';
import { PanelHeader } from '../PanelHeader';
import { HostSeat } from '../../../../components/common/HostSeat';
import type { Player, WerewolfMode } from '../../../../types';
import './index.css';

interface WerewolfModeDialogProps {
  modes: WerewolfMode[];
  selectedMode: WerewolfMode | null;
  onSelect: (mode: WerewolfMode) => void;
  players: Player[];
  selectedPlayerIds: number[];
  viewMode: string;
  onViewModeChange: (mode: string) => void;
  onPlayerToggle: (id: number | string) => void;
  hostId: number | null;
  onHostChange: (id: number | null) => void;
  error: string;
  onCancel: () => void;
  onStart: (mode: WerewolfMode, playerIds: number[], viewMode: string, opts: { hostId?: number | null }) => void;
}

export function WerewolfModeDialog({
  modes,
  selectedMode,
  onSelect,
  players,
  selectedPlayerIds,
  viewMode,
  onViewModeChange,
  onPlayerToggle,
  hostId,
  onHostChange,
  error,
  onCancel,
  onStart
}: WerewolfModeDialogProps) {
  const requiredCount = getWerewolfModePlayerCount(selectedMode);
  const selectedCount = selectedPlayerIds.length;
  const canStart = Boolean(selectedMode?.id) && selectedCount === requiredCount;
  const selectedViewMode = viewMode === 'player' ? 'player' : 'god';
  const hostPlayer = players.find((p) => Number(p.id) === Number(hostId)) || null;

  return (
    <div className="werewolf-mode-backdrop" role="presentation">
      <section className="werewolf-mode-dialog werewolf-setup-dialog" role="dialog" aria-modal="true" aria-label="狼人杀开局配置">
        <header>
          <h2>狼人杀开局配置</h2>
          <button type="button" onClick={onCancel}>返回</button>
        </header>
        <div className="werewolf-setup-grid">
          <section>
            <PanelHeader icon={<Moon size={18} />} title="模式" />
            <div className="werewolf-mode-grid">
              {modes.length ? modes.map((mode) => (
                <button
                  type="button"
                  className={classNames('werewolf-mode-card', selectedMode?.id === mode.id && 'active')}
                  onClick={() => onSelect(mode)}
                  key={mode.id}
                >
                  <strong>{mode.name}</strong>
                  <span>{(mode as WerewolfMode & { description?: string }).description}</span>
                  <small>{formatWerewolfModeSummary(mode)}</small>
                </button>
              )) : <p className="werewolf-mode-empty">暂无可用狼人杀模式，请先在 B 端启用模式。</p>}
            </div>
          </section>
          <section>
            <PanelHeader icon={<Users size={18} />} title={`玩家 ${selectedCount}/${requiredCount || '-'}`} />
            <HostSeat
              hostPlayer={hostPlayer}
              players={players}
              onSelect={(id: number | string | null) => onHostChange?.(id as number | null)}
              onRemove={() => onHostChange?.(null)}
            />
            <div className="werewolf-player-grid">
              {players.length ? players.map((player) => {
                const checked = selectedPlayerIds.includes(Number(player.id));
                return (
                  <button
                    type="button"
                    className={checked ? 'checked' : ''}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', String(player.id));
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={() => onPlayerToggle(player.id)}
                    key={player.id}
                  >
                    <span>{player.id}</span>
                    <strong>{player.nickname || player.name || `${player.id}号`}</strong>
                    {checked && <Check size={15} />}
                  </button>
                );
              }) : <p className="werewolf-mode-empty">正在读取 AI 玩家配置。</p>}
            </div>
          </section>
          <section className="werewolf-view-mode">
            <PanelHeader icon={<Eye size={18} />} title="C 端视角" />
            <div className="werewolf-view-mode-switch" role="group" aria-label="狼人杀观看视角">
              <button type="button" className={classNames(selectedViewMode === 'god' && 'active')} onClick={() => onViewModeChange('god')}>
                <Eye size={18} />
                <span>上帝视角</span>
                <small>展示完整夜间与身份信息</small>
              </button>
              <button type="button" className={classNames(selectedViewMode === 'player' && 'active')} onClick={() => onViewModeChange('player')}>
                <UserRound size={18} />
                <span>玩家视角</span>
                <small>开局随机代入一名玩家</small>
              </button>
            </div>
          </section>
        </div>
        {error && <p className="werewolf-setup-error">{error}</p>}
        <footer>
          <span></span>
          <button type="button" className="primary" disabled={!canStart} onClick={() => selectedMode && onStart(selectedMode, selectedPlayerIds, selectedViewMode, { hostId })}>开始游戏</button>
        </footer>
      </section>
    </div>
  );
}
