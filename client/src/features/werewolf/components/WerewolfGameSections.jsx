import React, { useMemo } from 'react';
import { ArrowLeft, Check, Crown, Eye, EyeOff, FastForward, Moon, Pause, Play, RotateCcw, Shield, Skull, Sun, Users } from 'lucide-react';
import { formatAvatarUrl } from '../../../utils/avatar';
import { classNames } from '../../../utils/gameState';
import { SpeechInsightOverlay } from '../../../components/SpeechInsightOverlay';
import { SpeechSubtitle } from '../../../components/SpeechSubtitle';
import {
  buildRoundProgress,
  formatWerewolfModeSummary,
  getGameStats,
  getPhaseTitle,
  getRoleConfigGroups,
  getRoleDescription,
  getRoundResult,
  getWerewolfActionTarget,
  getWerewolfHostOptions,
  getWerewolfModePlayerCount,
  ROLE_NAMES,
  shouldShowWerewolfActionTargets
} from '../werewolfUtils';

export function WerewolfControls({ autoPlay, startDisabled, playbackDisabled, showSkip, skipDisabled, onReturn, setAutoPlay, onStart, onSkipPhase }) {
  return (
    <nav className="werewolf-controls" aria-label="狼人杀控制">
      <button type="button" title="返回游戏选择" onClick={onReturn}>
        <ArrowLeft size={18} />
        <span>返回</span>
      </button>
      <button type="button" title={startDisabled ? '暂停后可以开局' : '开局'} disabled={startDisabled} onClick={onStart}>
        <RotateCcw size={18} />
        <span>开局</span>
      </button>
      <button
        type="button"
        title={playbackDisabled ? '开局后可播放' : autoPlay ? '暂停自动播放' : '继续自动播放'}
        disabled={playbackDisabled}
        onClick={() => setAutoPlay(!autoPlay)}
      >
        {autoPlay ? <Pause size={18} /> : <Play size={18} />}
        <span>{autoPlay ? '暂停' : '播放'}</span>
      </button>
      {showSkip && (
        <button
          type="button"
          title={skipDisabled ? '复盘播放中可跳过当前阶段' : '跳过当前阶段'}
          disabled={skipDisabled}
          onClick={onSkipPhase}
        >
          <FastForward size={18} />
          <span>跳过阶段</span>
        </button>
      )}
    </nav>
  );
}

export function WerewolfArena({
  game,
  mode,
  currentRound,
  currentSpeakerId,
  activeSpeech,
  showRoles,
  visibleRolePlayerId,
  streamMessage,
  onShowRolesChange,
  onPlayerSelect
}) {
  const orderedPlayers = useMemo(
    () => (game.players || []).slice().sort((a, b) => Number(a.id) - Number(b.id)),
    [game.players]
  );
  const stats = getGameStats(orderedPlayers);
  const phaseTitle = getPhaseTitle(currentRound, streamMessage);

  return (
    <section className="werewolf-arena">
      <div className="werewolf-stage-bg" aria-hidden="true" />
      <div className="werewolf-arena-vignette" aria-hidden="true" />

      <aside className="werewolf-side werewolf-left-board" aria-label="狼人杀左侧信息">
        <WerewolfBrandPanel game={game} mode={mode} showRoles={showRoles} onShowRolesChange={onShowRolesChange} />
        <RoleConfigPanel players={orderedPlayers} mode={mode} showRoles={showRoles} />
        <RoundProgressPanel rounds={game.rounds || []} currentRound={currentRound} />
      </aside>

      <section className="werewolf-orbit-stage" aria-label="狼人杀玩家圆桌">
        <div className="werewolf-scoreboard">
          <span>{game.event?.mode || mode?.name || '标准局'}</span>
          <h2>{currentRound ? `第 ${currentRound.day || 1} 天 · ${phaseTitle}` : '月夜圆桌等待开局'}</h2>
        </div>

        <div className="werewolf-table-ring" aria-hidden="true">
          <section className="werewolf-table" style={{ '--seat-count': orderedPlayers.length }} aria-label="狼人杀玩家座位">
            {orderedPlayers.map((player, index) => (
              <WerewolfSeat
                player={player}
                seatIndex={index}
                actionTarget={shouldShowWerewolfActionTargets(currentRound) ? getWerewolfActionTarget(currentRound, player) : null}
                isSheriff={Number(currentRound?.sheriffId) === Number(player.id)}
                showRoles={showRoles}
                visibleRolePlayerId={visibleRolePlayerId}
                currentSpeakerId={currentSpeakerId}
                onPlayerSelect={onPlayerSelect}
                key={player.id}
              />
            ))}
          </section>
        </div>

        <section className="werewolf-center-card" aria-live="polite">
          <div className="werewolf-center-ornament" aria-hidden="true">?</div>
          <span className="werewolf-phase-kicker">{currentRound?.phase === 'night' ? '夜晚行动' : currentRound?.phase === 'day' ? '白天议事' : '实时观战'}</span>
          <h2>{currentRound ? `${currentRound.phase === 'night' ? '夜晚' : '白天'}第 ${currentRound.day || 1} 轮` : '等待开局'}</h2>
          <dl>
            <div><dt>存活玩家</dt><dd>{stats.alive}</dd></div>
            <div><dt>出局玩家</dt><dd>{stats.dead}</dd></div>
          </dl>
          <p>{streamMessage}</p>
          <strong>{getRoundResult(currentRound)}</strong>
        </section>
      </section>

      <aside className="werewolf-side werewolf-right-board" aria-label="狼人杀右侧记录">
        <EliminationPanel players={orderedPlayers} showRoles={showRoles} visibleRolePlayerId={visibleRolePlayerId} />
      </aside>

      <WerewolfResult game={game} />
      <SpeechSubtitle speech={activeSpeech} />
      {/* <SpeechInsightOverlay speech={activeSpeech} players={game.players || []} /> */}
    </section>
  );
}

function WerewolfBrandPanel({ game, mode, showRoles, onShowRolesChange }) {
  return (
    <section className="werewolf-title-panel">
      <p>狼人杀</p>
      <h2>观赛视角</h2>
      <span>{mode?.name || game.event?.name || 'AI 狼人杀'}</span>
      <button type="button" onClick={() => onShowRolesChange((value) => !value)}>
        {showRoles ? <Eye size={18} /> : <EyeOff size={18} />}
        <span>{showRoles ? '上帝视角' : '玩家视角'}</span>
      </button>
    </section>
  );
}

function RoleConfigPanel({ players, mode, showRoles }) {
  const groups = getRoleConfigGroups(players, mode, showRoles);
  return (
    <section className="werewolf-panel werewolf-role-panel">
      <PanelHeader icon={<Users size={18} />} title="角色配置" />
      <div className="werewolf-role-list">
        {groups.map((group) => (
          <article className="werewolf-role-group" key={group.id}>
            <span className={classNames('werewolf-role-icon', group.id === 'wolves' && 'wolf')}>
              {group.icon}
            </span>
            <div>
              <strong>{group.name}<em>x{group.count}</em></strong>
              {group.details.length > 0 && (
                <p>{group.details.map((role) => `${role.name}x${role.count}`).join(' · ')}</p>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RoundProgressPanel({ rounds, currentRound }) {
  const items = buildRoundProgress(rounds, currentRound);
  return (
    <section className="werewolf-panel werewolf-progress-panel">
      <PanelHeader icon={<Moon size={18} />} title="回合进程" />
      <div className="werewolf-progress-list">
        {items.length ? items.map((item) => (
          <article className={item.active ? 'active' : ''} key={item.key}>
            {item.phase === 'day' ? <Sun size={19} /> : <Moon size={19} />}
            <span>{item.label}</span>
          </article>
        )) : <p>等待主持人开局。</p>}
      </div>
    </section>
  );
}

function EliminationPanel({ players, showRoles, visibleRolePlayerId }) {
  const eliminated = players
    .filter((player) => !player.alive)
    .sort((a, b) => Number(b.deathDay || 0) - Number(a.deathDay || 0));

  return (
    <section className="werewolf-panel werewolf-elimination-panel">
      <PanelHeader icon={<Skull size={18} />} title="淘汰记录" />
      <div className="werewolf-elimination-list">
        {eliminated.length ? eliminated.map((player) => (
          <article key={player.id}>
            <Skull size={18} />
            <strong>玩家 {player.id}</strong>
            <span>{player.roleLabel || ROLE_NAMES[player.role] || ''}</span>
            <em>{player.deathReason || '出局'} · 第 {player.deathDay || '?'} 天</em>
          </article>
        )) : <p>暂无玩家出局。</p>}
      </div>
    </section>
  );
}

export function WerewolfModeDialog({ modes, selectedMode, onSelect, players, selectedPlayerIds, selectedHostId, onHostChange, onPlayerToggle, error, onCancel, onStart }) {
  const requiredCount = getWerewolfModePlayerCount(selectedMode);
  const selectedCount = selectedPlayerIds.length;
  const canStart = Boolean(selectedMode?.id) && selectedCount === requiredCount;
  const hostOptions = getWerewolfHostOptions(players);
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
                  <span>{mode.description}</span>
                  <small>{formatWerewolfModeSummary(mode)}</small>
                </button>
              )) : <p className="werewolf-mode-empty">暂无可用狼人杀模式，请先在 B 端启用模式。</p>}
            </div>
          </section>
          <section>
            <PanelHeader icon={<Crown size={18} />} title="主持人" />
            <div className="werewolf-host-grid">
              {hostOptions.map((host) => (
                <button
                  type="button"
                  className={String(selectedHostId || 'default') === String(host.id) ? 'checked' : ''}
                  onClick={() => onHostChange(host.id)}
                  key={host.id}
                >
                  <span>{host.badge}</span>
                  <strong>{host.name}</strong>
                  <small>{host.description}</small>
                  {String(selectedHostId || 'default') === String(host.id) && <Check size={15} />}
                </button>
              ))}
            </div>
            <p className="werewolf-order-note">主持人只负责播报和推进流程，不占用玩家座位序号。</p>
          </section>
          <section>
            <PanelHeader icon={<Users size={18} />} title={`玩家 ${selectedCount}/${requiredCount || '-'}`} />
            <div className="werewolf-player-grid">
              {players.length ? players.map((player) => {
                const checked = selectedPlayerIds.includes(Number(player.id));
                return (
                  <button
                    type="button"
                    className={checked ? 'checked' : ''}
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
            <p className="werewolf-order-note">座位序号固定按玩家 ID 升序排列，不能手动拖拽调整。</p>
          </section>
        </div>
        {error && <p className="werewolf-setup-error">{error}</p>}
        <footer>
          <span>{selectedMode?.name || '请选择 B 端启用的模式'}</span>
          <button type="button" className="primary" disabled={!canStart} onClick={() => onStart(selectedMode, selectedPlayerIds, selectedHostId)}>开始游戏</button>
        </footer>
      </section>
    </div>
  );
}

function WerewolfSeat({ player, seatIndex, actionTarget, isSheriff, showRoles, visibleRolePlayerId, currentSpeakerId, onPlayerSelect }) {
  const isSpeaking = Number(currentSpeakerId) === Number(player.id);
  const roleText = player.roleLabel || ROLE_NAMES[player.role] || '';
  return (
    <article
      className={classNames('werewolf-seat', isSpeaking && 'speaking', !player.alive && 'dead', showRoles && player.role)}
      style={{ '--seat': seatIndex }}
    >
      <div
        className="werewolf-avatar player-detail-trigger"
        style={player.avatar ? { backgroundImage: `url("${formatAvatarUrl(player.avatar)}")` } : undefined}
        onClick={() => onPlayerSelect?.(player)}
        aria-label={`查看${player.nickname || player.name || `${player.id}号`}信息`}
      >
        {!player.avatar && (player.nickname || player.name || `${player.id}`).slice(0, 1)}
        <span className="werewolf-seat-number">{player.id}</span>
        {isSheriff && (
          <span className="werewolf-sheriff-badge" title="警长" aria-label="警长">
            <Crown size={18} />
          </span>
        )}
        {!player.alive && <span className="werewolf-dead-badge">出局</span>}
      </div>
      {actionTarget && <span className="werewolf-action-badge" title={`投给 ${actionTarget} 号`}>{actionTarget}</span>}
      <div className="werewolf-nameplate">
        <strong>{player.nickname || player.name || `${player.id}号`}</strong>
        <span>{roleText}</span>
      </div>
    </article>
  );
}

function WerewolfResult({ game }) {
  if (!game.winner) return null;
  const winner = game.winner === 'wolves' ? '狼人阵营胜利' : '好人阵营胜利';
  return (
    <section className="werewolf-result">
      <strong><Shield size={18} />{winner}</strong>
      <p>{game.winReason}</p>
    </section>
  );
}

function PanelHeader({ icon, title }) {
  return <div className="werewolf-panel-title">{icon}<strong>{title}</strong></div>;
}


export function WerewolfPlayerDetailModal({ player, roleVisible, onClose }) {
  const roleText = roleVisible ? player.roleLabel || ROLE_NAMES[player.role] || '未知身份' : '身份隐藏';
  return (
    <div className="player-detail-backdrop" role="presentation" onClick={onClose}>
      <section className="player-detail-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="player-detail-close" onClick={onClose} aria-label="关闭">×</button>
        <div className="player-detail-head">
          <div className="player-detail-avatar" style={player.avatar ? { backgroundImage: `url("${formatAvatarUrl(player.avatar)}")` } : undefined}>
            {!player.avatar && (player.nickname || player.name || `${player.id}`).slice(0, 1)}
          </div>
          <div>
            <h3>{player.nickname || player.name || `${player.id}号`}</h3>
            <p>{roleText}</p>
          </div>
        </div>
        <dl>
          <div><dt>性格</dt><dd>{player.personality || '暂无'}</dd></div>
          <div><dt>本局身份</dt><dd>{roleText}</dd></div>
          <div><dt>身份说明</dt><dd>{getRoleDescription(player, roleVisible)}</dd></div>
          <div><dt>状态</dt><dd>{player.alive ? '存活' : `${player.deathReason || '出局'} · 第 ${player.deathDay || '?'} 天`}</dd></div>
        </dl>
      </section>
    </div>
  );
}
