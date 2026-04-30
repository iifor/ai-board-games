import React from 'react';
import { BadgeCheck, BookOpen, FileSearch, Target, TriangleAlert, UserRound, Users } from 'lucide-react';
import { buildVoteCards, getConsensusTypeName } from '../utils/gameState';
import { PanelTitle } from './PanelTitle';

export function StatusPanel({ game, round, showRoles }) {
  const clueCount = game.rounds.filter((item) => item.clue).length;
  const formatPlayerNumber = createPlayerNumberFormatter(game.players);
  const marked = game.players.filter((player) => player.marked).map((player) => `${formatPlayerNumber(player.id)}号`);
  const excluded = game.players.filter((player) => player.excluded).map((player) => `${formatPlayerNumber(player.id)}号`);
  const activeCount = game.players.filter((player) => !player.excluded).length;

  return (
    <aside className="right-panel">
      <section className="framed-panel status-card">
        <PanelTitle title="调查状态" />
        <StatusRow icon={<Target size={24} />} label="当前阶段">
          <span>{getPhaseName(round.phase)}</span>
          <span>{getConsensusTypeName(round.consensusType)}</span>
        </StatusRow>
        <StatusRow icon={<FileSearch size={24} />} label="线索进度">
          <strong>{clueCount}</strong><span>/ 3 组</span>
        </StatusRow>
        <StatusRow icon={<UserRound size={24} />} label="有投票权">
          <strong>{activeCount}</strong><span>人</span>
        </StatusRow>
        <StatusRow icon={<Users size={24} />} label="身份信息">
          <span>{showRoles ? '上帝视角公开' : '玩家视角隐藏'}</span>
        </StatusRow>
      </section>

      <section className="framed-panel exile-panel">
        <PanelTitle title={getActionTitle(round)} compact />
        <div className="exile-cards">
          {buildVoteCards(getActionVotes(round), round.aliveIds).map((card, index) => (
            <article key={card.id} className={`exile-card ${index === 0 ? 'lead' : ''}`}>
              <strong>{formatPlayerNumber(card.id)}号</strong><span>得票数</span><b>{card.count}</b><em>票</em>
              <p>{card.voters.length ? card.voters.map((id) => `${formatPlayerNumber(id)}号`).join('、') : '暂无投票'}</p>
            </article>
          ))}
        </div>
        <p className="exile-note">{getActionResult(round, formatPlayerNumber)}</p>
      </section>

      <section className="framed-panel rules-card">
        <h3><BookOpen size={19} />线索与规则</h3>
        <ClueSummary round={round} />
        <p>第一轮：最高票获得风险标记；</p>
        <p>第二轮：权限冻结命中违规操作者，调查方立即胜利；</p>
        <p>第三轮：最终指认平票或指错，迷雾方胜利。</p>
        <p>已标记：{marked.join('、') || '暂无'}；已冻结：{excluded.join('、') || '暂无'}。</p>
      </section>
    </aside>
  );
}

function ClueSummary({ round }) {
  return (
    <div className="side-clue-list">
      <article>
        <FileSearch size={17} />
        <strong>{round.clue?.title || '本轮无线索'}</strong>
        <p>{round.clue?.text || '共识失败时不获得新线索。'}</p>
      </article>
      <article>
        <BadgeCheck size={17} />
        <strong>鉴定报告</strong>
        <p>{round.appraisal || '无'}</p>
      </article>
      {round.noise && (
        <article className="noise-active">
          <TriangleAlert size={17} />
          <strong>迷雾噪音</strong>
          <p>{round.noise}</p>
        </article>
      )}
    </div>
  );
}

function StatusRow({ icon, label, children }) {
  return <div className="status-row"><div className="status-icon">{icon}</div><span>{label}</span><div>{children}</div></div>;
}

function createPlayerNumberFormatter(players = []) {
  const numbers = new Map(players.map((player, index) => [Number(player.id), index + 1]));
  return (id) => numbers.get(Number(id)) || id;
}

function getPhaseName(phase) {
  if (phase === 'suspicion') return '风险标记';
  if (phase === 'exclusion') return '权限冻结';
  if (phase === 'final') return '最终指认';
  return '调查中';
}

function getActionTitle(round) {
  if (round.phase === 'suspicion') return '风险标记投票';
  if (round.phase === 'exclusion') return '权限冻结投票';
  if (round.phase === 'final') return '最终指认投票';
  return '行动投票';
}

function getActionVotes(round) {
  if (round.phase === 'suspicion') return round.suspicionVotes || {};
  if (round.phase === 'exclusion') return round.exclusionVotes || {};
  if (round.phase === 'final') return round.finalAccusationVotes || {};
  return {};
}

function getActionResult(round, formatPlayerNumber) {
  if (round.phase === 'suspicion') {
    return round.markedSuspects?.length ? `风险标记：${round.markedSuspects.map((id) => `${formatPlayerNumber(id)}号`).join('、')}` : '等待风险标记投票';
  }
  if (round.phase === 'exclusion') {
    return round.excluded?.length ? `权限冻结：${round.excluded.map((item) => `${formatPlayerNumber(item.id)}号`).join('、')}` : '等待权限冻结投票';
  }
  if (round.phase === 'final') {
    return round.finalTargets?.length ? `最高票指认：${round.finalTargets.map((id) => `${formatPlayerNumber(id)}号`).join('、')}` : '等待最终指认';
  }
  return '等待行动结果';
}
