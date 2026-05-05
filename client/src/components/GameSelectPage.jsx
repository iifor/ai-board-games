import React, { useEffect, useMemo, useState } from 'react';
import { Bot, ChevronLeft, Filter, Flame, Gamepad2, MessagesSquare, Moon, Plus, Search, Settings, Sparkles, UsersRound, X } from 'lucide-react';
import { fetchAiPlayers } from '../api/gameApi';

const GAME_RULES = {
  consensus: { min: 7, max: 7, recommended: 7, label: '固定 7 人', helper: '共识迷雾 v3.2 为固定 7 人标准局。' },
  debate: { min: 8, max: 12, recommended: 12, label: '8-12 人', helper: 'AI 辩论赛支持 8-12 人：4 正方、4 反方，多余 AI 进入评委席。' },
  werewolf: { min: 12, max: 12, recommended: 12, label: '固定 12 人', helper: 'AI 狼人杀为 12 人标准局：4 狼、4 神、4 民。' }
};

const fallbackPlayers = [
];

const games = [
  {
    key: 'consensus',
    title: '迷雾共识',
    meta: '固定7人 · v3.2',
    tags: ['AI陪玩', '支持多人'],
    tone: 'consensus',
    badge: <Sparkles size={24} />,
    action: true,
    rules: ['固定 7 人', '三轮调查', '迷雾推理']
  },
  {
    key: 'debate',
    title: 'AI 辩论赛',
    meta: '8-12人 · 正反交锋',
    tags: ['AI主持', '评委点评'],
    tone: 'debate',
    badge: <MessagesSquare size={24} />,
    action: true,
    rules: ['4v4 辩论', '随机队长', '评选最佳选手']
  },
  {
    key: 'werewolf',
    title: 'AI 狼人杀',
    meta: '固定12人 · 昼夜推理',
    tags: ['AI主持', '身份推理'],
    tone: 'wolf',
    badge: <Moon size={24} />,
    action: true,
    rules: ['4狼4神4民', '夜晚技能', '白天放逐']
  },
  { title: '敬请期待', meta: '开发中', tags: ['即将上线'], tone: 'avalon' }
];

const categories = ['热门推荐', '推理社交', '策略博弈', '轻松聚会'];
const platformFeatures = [
  { icon: Bot, title: 'AI主持', subtitle: '智能带玩' },
  { icon: Gamepad2, title: '快速匹配', subtitle: '秒开房间' },
  { icon: UsersRound, title: '支持多人', subtitle: '2-12人畅玩' },
  { icon: Sparkles, title: '一键开局', subtitle: '省时省心' }
];

export function GameSelectPage({ onBack, onStartConsensus, onStartDebate, onStartWerewolf }) {
  const [players, setPlayers] = useState(fallbackPlayers);
  const [selectedIds, setSelectedIds] = useState(() => fallbackPlayers.slice(0, GAME_RULES.consensus.recommended).map((player) => player.id));
  const [activeGameKey, setActiveGameKey] = useState('');
  const [loadError, setLoadError] = useState('');
  const activeRule = GAME_RULES[activeGameKey] || GAME_RULES.consensus;
  const showPlayerModal = Boolean(activeGameKey);

  useEffect(() => {
    let cancelled = false;
    fetchAiPlayers()
      .then((items) => {
        if (cancelled || !items.length) return;
        setPlayers(items);
        setSelectedIds(items.slice(0, activeRule.recommended).map((player) => player.id));
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCount = selectedIds.length;
  const canStart = selectedCount >= activeRule.min && selectedCount <= activeRule.max;
  const selectedNames = useMemo(
    () => selectedIds
      .map((id) => players.find((player) => player.id === id))
      .filter(Boolean)
      .map((player) => player.nickname || player.name || `${player.id}号`),
    [players, selectedIds]
  );

  function togglePlayer(id) {
    setSelectedIds((value) => value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  }

  function confirmStart() {
    if (!canStart) return;
    if (activeGameKey === 'debate') onStartDebate(selectedIds);
    else if (activeGameKey === 'werewolf') onStartWerewolf(selectedIds);
    else onStartConsensus(selectedIds);
  }

  function openPlayerModal(gameKey) {
    const rule = GAME_RULES[gameKey] || GAME_RULES.consensus;
    setActiveGameKey(gameKey);
    setSelectedIds(players.slice(0, rule.recommended).map((player) => player.id));
  }

  function closePlayerModal() {
    setActiveGameKey('');
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
            <h2>选择你想看的游戏</h2>
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
                    {game.rules.map((rule) => <span key={rule}>{rule}</span>)}
                  </div>
                )}
              </div>
              {game.action && (
                <button className="neon-button game-start-button" onClick={() => openPlayerModal(game.key)}>
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
            <button className="player-select-close" onClick={closePlayerModal} aria-label="关闭">
              <X size={22} />
            </button>
            <p className="eyebrow">AI 玩家</p>
            <h2 id="player-select-title">选择加入{getGameName(activeGameKey)}的 AI</h2>
            <p className="player-select-tip">{activeRule.helper}本局游戏只会使用你勾选的玩家。</p>
            {loadError && <p className="player-select-warning">{loadError}，已使用默认玩家列表。</p>}

            <div className="player-select-start-row">
              <div>
                <span>已选择 {selectedCount} / {activeRule.label}</span>
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
              {!canStart && <em>{activeRule.min === activeRule.max ? `请选择恰好 ${activeRule.recommended} 位 AI 玩家后开始。` : `请选择 ${activeRule.min}-${activeRule.max} 位 AI 玩家后开始。`}</em>}
            </div>

            <div className="player-select-actions">
              <button onClick={closePlayerModal}>取消</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function getGameName(gameKey) {
  if (gameKey === 'debate') return 'AI 辩论赛';
  if (gameKey === 'werewolf') return 'AI 狼人杀';
  return '本局';
}
