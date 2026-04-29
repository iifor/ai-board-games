import React from 'react';
import { ArrowLeft, Eye, EyeOff, MessageCircle, Pause, Power, Settings, Volume2, VolumeX } from 'lucide-react';
import { classNames } from '../utils/gameState';

export function TopNav({
  currentRound,
  currentEvent,
  autoPlay,
  showRoles,
  mockMode,
  speechEnabled,
  controlsLocked,
  returnDisabled,
  onReturn,
  onModeToggle,
  onSpeechToggle,
  setAutoPlay,
  setShowRoles
}) {
  return (
    <header className="top-nav">
      <div className="brand">
        <div className="brand-mark">◎</div>
        <div>
          <h1>共识迷雾</h1>
          <span>Lite v1.1</span>
        </div>
      </div>

      <div className="round-title">
        <span>第</span>
        <strong>{currentRound.number}</strong>
        <span>/ 3 轮</span>
      </div>

      <div className="phase-badge">
        <MessageCircle size={18} />
        <span>阶段：{currentEvent.title}</span>
      </div>

      <nav className="nav-actions" aria-label="游戏菜单">
        <button title="返回游戏选择" onClick={onReturn} disabled={returnDisabled}>
          <ArrowLeft size={23} />
          <span>返回</span>
        </button>
        <button title={showRoles ? '隐藏身份' : '显示身份'} onClick={() => setShowRoles(!showRoles)}>
          {showRoles ? <EyeOff size={23} /> : <Eye size={23} />}
          <span>身份</span>
        </button>
        <button className="mode-switch" title="Mock 模式开关" onClick={onModeToggle} disabled={controlsLocked}>
          <span className={classNames('switch-track', mockMode && 'active')}><i /></span>
          <span>{mockMode ? 'Mock' : '真实'}</span>
        </button>
        <button title={speechEnabled ? '关闭语音' : '开启语音'} onClick={onSpeechToggle} disabled={controlsLocked}>
          {speechEnabled ? <Volume2 size={23} /> : <VolumeX size={23} />}
          <span>语音</span>
        </button>
        <button title="设置">
          <Settings size={23} />
          <span>设置</span>
        </button>
        <button title={autoPlay ? '暂停' : '播放'} onClick={() => mockMode && setAutoPlay(!autoPlay)} disabled={!mockMode}>
          {autoPlay ? <Pause size={23} /> : <Power size={23} />}
          <span>{autoPlay ? '暂停' : '播放'}</span>
        </button>
      </nav>
    </header>
  );
}
