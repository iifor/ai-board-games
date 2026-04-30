import React, { useEffect, useMemo, useState } from 'react';
import { Bot, ChevronLeft, Filter, Flame, Gamepad2, Plus, Search, Settings, Sparkles, UsersRound, X } from 'lucide-react';
import { fetchAiPlayers } from '../api/gameApi';

const MIN_PLAYERS = 7;
const MAX_PLAYERS = 7;
const RECOMMENDED_PLAYERS = 7;

const fallbackPlayers = [
];

const games = [
  {
    title: '迷雾共识',
    meta: '固定7人 · v3.2',
    tags: ['AI陪玩', '支持多人'],
    tone: 'consensus',
    badge: <Sparkles size={24} />,
    action: true
  },
  { title: '敬请期待', meta: '开发中', tags: ['即将上线'], tone: 'wolf' },
  { title: '敬请期待', meta: '开发中', tags: ['即将上线'], tone: 'avalon' },
  { title: '敬请期待', meta: '开发中', tags: ['即将上线'], tone: 'undercover' }
];

const categories = ['热门推荐', '推理社交', '策略博弈', '轻松聚会'];
const platformFeatures = [
  { icon: Bot, title: 'AI主持', subtitle: '智能带玩' },
  { icon: Gamepad2, title: '快速匹配', subtitle: '秒开房间' },
  { icon: UsersRound, title: '支持多人', subtitle: '2-12人畅玩' },
  { icon: Sparkles, title: '一键开局', subtitle: '省时省心' }
];

export function GameSelectPage({ onBack, onStartConsensus }) {
  const [players, setPlayers] = useState(fallbackPlayers);
  const [selectedIds, setSelectedIds] = useState(() => fallbackPlayers.slice(0, RECOMMENDED_PLAYERS).map((player) => player.id));
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchAiPlayers()
      .then((items) => {
        if (cancelled || !items.length) return;
        setPlayers(items);
        setSelectedIds(items.slice(0, RECOMMENDED_PLAYERS).map((player) => player.id));
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCount = selectedIds.length;
  const canStart = selectedCount >= MIN_PLAYERS && selectedCount <= MAX_PLAYERS;
  const selectedNames = useMemo(
    () => players.filter((player) => selectedIds.includes(player.id)).map((player) => player.nickname || player.name || `${player.id}号`),
    [players, selectedIds]
  );

  function togglePlayer(id) {
    setSelectedIds((value) => value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  }

  function confirmStart() {
    if (!canStart) return;
    onStartConsensus(selectedIds);
  }

  return (
    <main className="game-select-page">
      <header className="select-topbar">
        <button className="select-icon-button" onClick={onBack} aria-label="返回首页">
          <ChevronLeft size={34} />
        </button>
        <h1>游戏选择</h1>
        <div className="select-top-actions">
          <button className="select-room-button"><UsersRound size={22} />我的房间</button>
          <button className="select-icon-button" aria-label="设置"><Settings size={24} /></button>
        </div>
      </header>

      <section className="select-layout">
        <aside className="select-sidebar">
          <div>
            <h2>选择你想玩的游戏</h2>
            <p>热门桌游 · AI主持 · 一键开局</p>
          </div>

          <div className="select-search">
            <Search size={22} />
            <span>搜索游戏名称</span>
            <button><Filter size={18} />筛选</button>
          </div>

          <div className="select-categories">
            {categories.map((item, index) => (
              <button className={index === 0 ? 'active' : ''} key={item}>
                {index === 0 && <Flame size={19} />}
                {item}
              </button>
            ))}
          </div>

          <div className="select-feature-grid">
            {platformFeatures.map(({ icon: Icon, title, subtitle }) => (
              <article className="feature-tile" key={title}>
                <Icon size={30} />
                <strong>{title}</strong>
                <span>{subtitle}</span>
              </article>
            ))}
          </div>
        </aside>

        <section className="game-card-grid" aria-label="游戏列表">
          {games.map((game) => (
            <article className={`game-card ${game.tone} ${game.action ? 'featured' : ''}`} key={`${game.title}-${game.tone}`}>
              <div className="game-card-art">
                <div className="game-card-symbol">{game.badge || <Gamepad2 size={30} />}</div>
              </div>
              <div className="game-card-body">
                <h3>{game.title}</h3>
                <div className="game-tags">
                  {game.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <p>{game.meta}</p>
                {game.action && (
                  <div className="game-player-rule">
                    <span>固定 {RECOMMENDED_PLAYERS} 人</span>
                    <span>三轮调查</span>
                    <span>迷雾推理</span>
                  </div>
                )}
              </div>
              {game.action && (
                <button className="neon-button game-start-button" onClick={() => setShowPlayerModal(true)}>
                  立即开始
                  <span>›</span>
                </button>
              )}
            </article>
          ))}
        </section>
      </section>

      <button className="create-room-button">
        <Gamepad2 size={23} />
        创建房间
        <Plus size={22} />
      </button>

      {showPlayerModal && (
        <div className="player-select-backdrop" role="presentation">
          <section className="player-select-modal" role="dialog" aria-modal="true" aria-labelledby="player-select-title">
            <button className="player-select-close" onClick={() => setShowPlayerModal(false)} aria-label="关闭">
              <X size={22} />
            </button>
            <p className="eyebrow">AI PLAYERS</p>
            <h2 id="player-select-title">选择加入本局的 AI</h2>
            <p className="player-select-tip">共识迷雾 v3.2 为固定 {RECOMMENDED_PLAYERS} 人标准局。本局游戏只会使用你勾选的玩家。</p>
            {loadError && <p className="player-select-warning">{loadError}，已使用默认玩家列表。</p>}

            <div className="player-select-start-row">
              <div>
                <span>已选择 {selectedCount} / {RECOMMENDED_PLAYERS}</span>
                <strong>{selectedNames.join('、') || '暂无'}</strong>
              </div>
              <button className="neon-button primary-start-button" onClick={confirmStart} disabled={!canStart}>
                确认开局
                <span>›</span>
              </button>
            </div>

            <div className="player-option-list">
              {players.map((player) => {
                const checked = selectedIds.includes(player.id);
                return (
                  <label className={`player-option ${checked ? 'checked' : ''}`} key={player.id}>
                    <input type="checkbox" checked={checked} onChange={() => togglePlayer(player.id)} />
                    <span className="player-option-index">{player.id}</span>
                    <span className="player-option-main">
                      <strong>{player.nickname || player.name || `${player.id}号`}</strong>
                      <em>{player.provider}/{player.model}</em>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="player-select-summary">
              <span>已选择 {selectedCount} 位</span>
              <strong>{selectedNames.join('、') || '暂无'}</strong>
              {!canStart && <em>请选择恰好 {RECOMMENDED_PLAYERS} 位 AI 玩家后开始。</em>}
            </div>

            <div className="player-select-actions">
              <button onClick={() => setShowPlayerModal(false)}>取消</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
