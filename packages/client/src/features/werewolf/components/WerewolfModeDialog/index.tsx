import { Bug, Check, Eye, Moon, UserRound, Users } from 'lucide-react';
import { classNames } from '../../../../utils/classNames';
import { canSubmitWerewolfSetup, formatWerewolfModeSummary, getWerewolfModePlayerCount, normalizeWerewolfSelectedIds } from '../../utils';
import { PanelHeader } from '../PanelHeader';
import type { Player, WerewolfMode } from '../../../../types';
import './index.css';

interface WerewolfModeDialogProps {
  compact?: boolean;
  modes: WerewolfMode[];
  selectedMode: WerewolfMode | null;
  onSelect: (mode: WerewolfMode) => void;
  players: Player[];
  selectedPlayerIds: number[];
  viewMode: string;
  onViewModeChange: (mode: string) => void;
  debugMode: boolean;
  onDebugModeChange: (enabled: boolean) => void;
  onPlayerToggle: (id: number | string) => void;
  hostId: number | null;
  onHostChange: (id: number | null) => void;
  error: string;
  onCancel: () => void;
  onStart: (mode: WerewolfMode, playerIds: number[], viewMode: string, opts: { hostId?: number | null; debugMode?: boolean }) => void;
}

export function WerewolfModeDialog({
  compact = false,
  modes,
  selectedMode,
  onSelect,
  players,
  selectedPlayerIds,
  viewMode,
  onViewModeChange,
  debugMode,
  onDebugModeChange,
  onPlayerToggle,
  hostId,
  error,
  onCancel,
  onStart
}: WerewolfModeDialogProps) {
  const requiredCount = getWerewolfModePlayerCount(selectedMode);
  const selectedCount = selectedPlayerIds.length;
  const canStart = canSubmitWerewolfSetup({
    modeId: selectedMode?.id,
    selectedCount,
    requiredCount,
    availableCount: players.length,
    debugMode
  });
  const selectedViewMode = viewMode === 'player' ? 'player' : 'god';

  return (
    <div className="werewolf-mode-backdrop" role="presentation">
      <section className="werewolf-mode-dialog werewolf-setup-dialog" role="dialog" aria-modal="true" aria-label="狼人杀开局配置">
        <header>
          {compact ? <div className="werewolf-setup-heading"><small>月夜对局</small><h2>选择游戏模式</h2></div> : <h2>狼人杀开局配置</h2>}
          <button type="button" onClick={onCancel}>返回</button>
        </header>
        <div className="werewolf-setup-grid">
          <section>
            {compact ? <div className="werewolf-mode-focus"><span><Moon size={17} />游戏模式</span><strong>{selectedMode?.name || '请选择模式'}</strong></div> : <PanelHeader icon={<Moon size={18} />} title="模式" />}
            <div className="werewolf-mode-grid">
              {modes.length ? modes.map((mode) => (
                <button
                  type="button"
                  className={classNames('werewolf-mode-card', selectedMode?.id === mode.id && 'active')}
                  onClick={() => onSelect(mode)}
                  key={mode.id}
                >
                  <strong>{mode.name}</strong>
                  <small>{formatWerewolfModeSummary(mode)}</small>
                </button>
              )) : <p className="werewolf-mode-empty">暂无可用狼人杀模式，请先在 B 端启用模式。</p>}
            </div>
          </section>
          <section className={classNames('werewolf-player-section', compact && 'is-collapsible')}>
            {!compact && <PanelHeader icon={<Users size={18} />} title={`玩家 ${selectedCount}/${requiredCount || '-'}`} />}
            <details open={compact ? undefined : true}>
              <summary tabIndex={compact ? 0 : -1} onClick={compact ? undefined : (event) => event.preventDefault()}>
                <Users size={18} />
                <strong>玩家 {selectedCount}/{requiredCount || '-'}</strong>
                <small>展开调整</small>
              </summary>
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
            </details>
          </section>
          <section className="werewolf-view-mode">
            {compact ? (
              <div className="werewolf-compact-switches">
                <button type="button" role="switch" aria-checked={selectedViewMode === 'player'} onClick={() => onViewModeChange(selectedViewMode === 'god' ? 'player' : 'god')}>
                  <span><Eye size={17} />观看视角</span>
                  <strong>{selectedViewMode === 'god' ? '上帝视角' : '玩家视角'}</strong>
                  <i aria-hidden="true" />
                </button>
                <button type="button" role="switch" aria-checked={debugMode} onClick={() => onDebugModeChange(!debugMode)}>
                  <span><Bug size={17} />调试模式</span>
                  <strong>{debugMode ? '开启' : '关闭'}</strong>
                  <i aria-hidden="true" />
                </button>
              </div>
            ) : <>
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
            <button type="button" className={classNames('werewolf-debug-toggle', debugMode && 'active')} onClick={() => onDebugModeChange(!debugMode)}>
              <Bug size={18} />
              <span>调试模式</span>
              <small>固定发言，浏览器语音</small>
            </button>
            </>}
          </section>
        </div>
        {error && <p className="werewolf-setup-error">{error}</p>}
        <footer>
          <span></span>
          <button
            type="button"
            className="primary"
            disabled={!canStart}
            onClick={() => selectedMode && onStart(
              selectedMode,
              debugMode ? normalizeWerewolfSelectedIds(selectedPlayerIds, players, selectedMode) : selectedPlayerIds,
              selectedViewMode,
              { hostId, debugMode }
            )}
          >{compact ? '进入月夜' : '开始游戏'}</button>
        </footer>
      </section>
    </div>
  );
}
