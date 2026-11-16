/// <reference types="node" />
import type { AudienceView } from '@battle/shared';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { nextFocusIndex } from '../../hooks/useDialogFocus';
import { BallotFlight } from './components/BallotFlight';
import { DebateTitle } from './components/DebateTitle';
import { SentenceCaptions } from './components/SentenceCaptions';
import { Stage } from './components/Stage';
import { StageRecord } from './components/StageRecord';
import { ResultPanel } from './components/ResultPanel';
import { ResultRoster } from './components/ResultRoster';
import { CircleLayout } from './layouts/CircleLayout';
import { fitRingBox, ringGeometry, seatAnchors, speechBox } from './layouts/ringGeometry';
import { VersusLayout } from './layouts/VersusLayout';
import { debateTopicOf } from './layouts/debateTopic';
import { meta, seat, summary, view } from './stage.fixtures';
import { isAsleep } from './utils';

const wolfView: AudienceView = { ...view, gameKey: 'werewolf', seats: [seat(1, null), seat(2, null), seat(3, null)], extra: { sheriff: 2, board: '预女猎白' } };

describe('layouts', () => {
  it('lights only the current wolf speaker, follows a new speaker and clears for narration', () => {
    const render = (event: import('@battle/shared').StageEvent) => {
      const html = renderToStaticMarkup(<Stage layout="circle" view={wolfView} played={[]}
        current={{ event: { ...event, view: wolfView }, audio: null }} />);
      return html.split('class="circle-seat"').slice(1).filter(part => part.includes('class="seat-spotlight"'))
        .map(part => Number(/data-seat="(\d+)"/.exec(part)?.[1]));
    };
    expect(render({ ...meta, kind: 'speech', seat: 1, text: '我的发言' })).toEqual([1]);
    expect(render({ ...meta, kind: 'speech', seat: 2, text: '下一位发言' })).toEqual([2]);
    expect(render({ ...meta, kind: 'speech', seat: 3, text: '出局玩家遗言' })).toEqual([3]);
    expect(render({ ...meta, kind: 'narration', text: '现在开始投票' })).toEqual([]);
    expect(render({ ...meta, kind: 'phase_started', title: '退水' })).toEqual([]);
  });

  it('places each stance above its own team and keeps the stage clear for playback', () => {
    const html = renderToStaticMarkup(<VersusLayout view={view} speaking={1} center={<p>字幕</p>} />);
    const title = renderToStaticMarkup(<DebateTitle title={debateTopicOf(view)!.title} />);
    expect(title).toContain('<h1 class="versus-topic"><span>测试辩题</span></h1>');
    expect(html).not.toContain('测试辩题');
    expect(html).toContain('<h3>正方</h3><p title="支持">支持</p></header><div class="versus-team-seats">');
    expect(html).toContain('<h3>反方</h3><p title="反对">反对</p></header><div class="versus-team-seats">');
    expect(html.indexOf('玩家1')).toBeLessThan(html.indexOf('字幕'));
    expect(html).toContain('seat-card-speaking');
    expect(html.match(/class="seat-spotlight"/g)).toHaveLength(1);
    expect(html).not.toContain('class="seat-mic"');
    expect(html).toContain('正方一辩');
    expect(html).toContain('反方一辩');
    expect(html).toContain('评委席');
  });

  it('can display a title or one stance when the remaining fields are missing', () => {
    const partial = { ...view, extra: { topic: { title: '  辩题  ', con: '反对', pro: null } } };
    expect(debateTopicOf(partial)).toEqual({ title: '辩题', con: '反对', pro: '' });
    const html = renderToStaticMarkup(<VersusLayout view={partial} speaking={null} center={null} />);
    expect(html).toContain('<h3>正方</h3></header>');
    expect(html).toContain('<h3>反方</h3><p title="反对">反对</p>');
    expect(debateTopicOf(null)).toBeNull();
  });

  it('uses player portraits on debate cards and retains the last spoken text between segments', () => {
    const debate = { ...view, seats: [
      { ...seat(1, 'pro', 1), name: '01 号模拟玩家' },
      { ...seat(2, 'con', 1), name: '豆包', avatar: '/custom.png' },
    ] };
    const speech = { event: { ...meta, view: debate, kind: 'speech' as const, seat: 2, text: '已播完的立论' }, audio: null };
    const html = renderToStaticMarkup(<Stage layout="versus" view={debate} current={null} played={[speech]} />);
    expect(html).toContain('/player-posters/doubao.webp');
    expect(html.match(/src="\/custom\.png"/g)).toHaveLength(1);
    expect(html).toContain('已播完的立论');
    expect(html).toContain('aria-label="舞台发言"');
    expect(html.match(/aria-live=/g)).toHaveLength(1);
    expect(html).not.toContain('speaker-spotlight');
    expect(html).toContain('class="speech-figure" data-art="cutout" src="/player-poster-cutouts/doubao.webp"');
    const record = <StageRecord items={[speech]} filter="speech" onFilter={() => {}} onClose={() => {}} />;
    const history = renderToStaticMarkup(<Stage layout="versus" view={debate} current={speech} played={[]} record={record} />);
    expect(history.indexOf('stage-record')).toBeGreaterThan(history.indexOf('versus-center'));
    expect(history.indexOf('stage-record')).toBeLessThan(history.indexOf('versus-side-con'));
    expect(history).not.toContain('speech-carousel');
    expect(history).toContain('已播完的立论');
    expect(history).not.toContain('class="stage-feed ');
  });

  it('uses the speaking seat for the debate backdrop and clears it for narration', () => {
    const debate = { ...view, seats: [{ ...seat(1, 'pro', 1), name: '02 号模拟玩家' }, { ...seat(2, 'con', 1), avatar: '/guest.png' }] };
    const render = (event: import('@battle/shared').StageEvent) =>
      renderToStaticMarkup(<Stage layout="versus" view={debate} played={[]} current={{ event: { ...event, view: debate }, audio: null }} />);
    expect(render({ ...meta, kind: 'speech', seat: 1, text: '发言' })).toContain('data-art="cutout" src="/player-poster-cutouts/grok.webp"');
    expect(render({ ...meta, kind: 'speech', seat: 2, text: '回应' })).toContain('data-art="portrait" src="/guest.png"');
    expect(render({ ...meta, kind: 'narration', text: '主持播报' })).not.toContain('speech-carousel');
  });

  it.each(['circle', 'versus'] as const)('separates %s current judgement from the historical record', (layout) => {
    const speech = { event: { ...meta, kind: 'speech' as const, seat: 1, text: '首条发言' }, audio: null };
    const last = { event: { ...speech.event, seq: 2, text: '上一位的观点' }, audio: null };
    const host = { event: { ...meta, seq: 3, kind: 'narration' as const, text: '请继续' }, audio: null };
    const judge = { event: { ...meta, seq: 4, kind: 'judgement' as const, seat: 3, verdict: 'pro', verdictLabel: '正方胜', comment: '最后点评' }, audio: null };
    const html = renderToStaticMarkup(<Stage layout={layout} view={view} current={null} played={[speech, last, host, judge]} />);
    expect(html).toContain('aria-label="当前发言"');
    expect(html.match(/class="speech-messages"/g)).toHaveLength(1);
    expect(html).not.toContain('role="region" aria-label="历史发言"');
    expect(html).not.toContain('首条发言');
    expect(html).toContain('data-slot="current" data-seq="4"');
    expect(html).not.toContain('上一位的观点');
    const record = renderToStaticMarkup(<StageRecord items={[speech,last,host]} filter="speech" onFilter={() => {}} onClose={() => {}} />);
    expect(record.indexOf('首条发言')).toBeLessThan(record.indexOf('上一位的观点'));
    expect(record).not.toContain('最后点评');
    expect(html).toContain('最后点评');
    expect(html.match(/最后点评/g)).toHaveLength(1);
    expect(html).toContain('<strong class="speech-author">3 号 · 玩家3</strong> 正方胜。最后点评');
    expect(html).not.toContain('<small>发言</small>');
    expect(html).not.toContain('请继续');
    expect(html.match(/aria-live=/g)).toHaveLength(1);
  });

  it('colors the signature already present in scripted speech without adding another one', () => {
    const seatView = { ...view, seats: [{ ...seat(5, 'con'), name: '05 号模拟玩家' }] };
    const event = { ...meta, view: seatView, kind: 'speech' as const, seat: 5, text: '【调试】5号 05 号模拟玩家（反方一辩）在「立论」的发言' };
    const html = renderToStaticMarkup(<Stage layout="versus" view={seatView} current={{ event, audio: null }} played={[]} />);
    expect(html).toContain('【调试】<strong class="speech-author">5号 05 号模拟玩家</strong>（反方一辩）');
    expect(html).not.toContain('<small>发言</small>');
  });

  it('keeps only one sentence in the footer when playback has finished', () => {
    const event = { ...meta, kind: 'speech' as const, seat: 1, text: '这是第一句。这是最后一句。' };
    const html = renderToStaticMarkup(<SentenceCaptions item={{ event, audio: null }} control={null} />);
    expect(html).toContain('aria-label="逐句字幕"');
    expect(html).toContain('1 号 · 玩家1');
    expect(html).toContain('这是最后一句。');
    expect(html).not.toContain('这是第一句。');
    expect(html).not.toContain('aria-live');
  });

  it('shows anonymous-role seats as player figures and opens history inside the wolf ring', () => {
    const wolf = { ...wolfView, seats: [{ ...seat(1, null), name: '02 号模拟玩家' }] };
    const record = <StageRecord items={[]} filter="all" onFilter={() => {}} onClose={() => {}} />;
    const html = renderToStaticMarkup(<Stage layout="circle" view={wolf} current={null} played={[]} record={record} />);
    expect(html).toContain('class="seat-figure-art" data-art="cutout" src="/player-poster-cutouts/grok.webp"');
    expect(html).not.toContain('身份未知');
    expect(html).toContain('02 号模拟玩家');
    expect(html).not.toContain('data-team=');
    expect(html.indexOf('stage-record')).toBeGreaterThan(html.indexOf('circle-center'));
    expect(html).not.toContain('speaker-spotlight');
  });

  it('places every seat on the ring and marks the sheriff and the dead', () => {
    const html = renderToStaticMarkup(<CircleLayout view={wolfView} speaking={null} center={null} />);
    expect(html.match(/class="circle-seat"/g)).toHaveLength(3);
    expect(html).toContain('data-seat="2"');
    expect(html).toContain('警长');
    expect(html).not.toContain('预女猎白');
    expect(html).toContain('seat-card-out');
    expect(html).not.toContain('身份未知');
  });

  it('shows the seat number once for default names, and keeps custom names and visible roles', () => {
    const seats = [
      { ...seat(1, null), name: '01 号模拟玩家' },
      { ...seat(2, null), name: '月白', roleName: '村民' },
    ];
    const html = renderToStaticMarkup(<CircleLayout view={{ ...wolfView, seats }} speaking={null} center={null} />);
    expect(html).toContain('class="ring-seat-platform">1 号</b>');
    expect(html).toContain('class="ring-seat-platform">2 号</b><span class="ring-seat-name" title="月白">月白</span>');
    expect(html).toContain('class="ring-seat-head"><span class="ring-seat-role">村民</span><em>警长</em></span>');
    expect(html).not.toContain('seat-card-no');
  });

  it('puts the living seats to sleep at night except the acting one, and wakes everyone by day', () => {
    const night = renderToStaticMarkup(<CircleLayout view={wolfView} speaking={2} center={null} period="night" />);
    expect(night).not.toContain('seat-mic');
    expect(night).toContain('aria-label="2号 玩家2，正在发言"');
    expect(night.match(/seat-card-asleep/g)).toHaveLength(1);
    expect(night).not.toContain('seat-card-eyes');
    expect(night).toMatch(/data-seat="1"[^]*?seat-card-asleep/);
    expect(night).toMatch(/seat-card-speaking/);
    expect(night).not.toMatch(/seat-card-speaking seat-card-asleep/);
    expect(night).not.toMatch(/seat-card-asleep seat-card-out/);
    expect(renderToStaticMarkup(<CircleLayout view={wolfView} speaking={2} center={null} period="day" />)).not.toContain('seat-card-asleep');
    expect(isAsleep(seat(3, null), null, 'night')).toBe(false);
    expect(isAsleep(seat(1, null), 1, 'night')).toBe(false);
    expect(isAsleep(seat(1, null), 2, 'night')).toBe(true);
    expect(isAsleep(seat(1, null), 2, 'day')).toBe(false);
  });

  it('mounts the ballot flight inside the ring during a tally and skips it when there is no time budget', () => {
    const vote = { seq: 7, ballots: [{ voter: 1, target: 2, weight: 1 }, { voter: 3, target: 2, weight: 1 }], abstained: [], timing: { durationMs: 400, staggerMs: 80, totalMs: 480 } };
    const html = renderToStaticMarkup(<CircleLayout view={wolfView} speaking={null} center={null} vote={vote} />);
    expect(html).toContain('class="ballot-flight"');
    expect(html).toContain('data-flight="b1-2"');
    expect(html).toContain('data-flight="b3-2"');
    expect(html.indexOf('class="ballot-flight"')).toBeGreaterThan(html.lastIndexOf('class="circle-seat"'));
    const idle = { ...vote, timing: { durationMs: 0, staggerMs: 0, totalMs: 0 } };
    expect(renderToStaticMarkup(<CircleLayout view={wolfView} speaking={null} center={null} vote={idle} />)).not.toContain('ballot-flight');
    const abstain = renderToStaticMarkup(<BallotFlight plan={{ items: [{ kind: 'abstain', key: 'a4', voter: 4, at: { x: 10, y: 20 }, delayMs: 0, durationMs: 300 }], totalMs: 300 }} />);
    expect(abstain).toContain('is-abstain');
    expect(abstain).toContain('left:10px');
    expect(renderToStaticMarkup(<BallotFlight plan={{ items: [], totalMs: 0 }} />)).toBe('');
  });

  it('shows the result with the MVP, the roster and the rematch actions', () => {
    const result = { winner: 'pro', winnerLabel: '正方胜出', summary: '正方胜出（评委 2:1）', mvp: 1, endReason: 'normal' as const };
    const html = renderToStaticMarkup(<ResultPanel result={result} view={view} />);
    expect(html).toContain('正方胜出');
    expect(html).toContain('MVP：1号 玩家1');
    expect(html).toContain('正方 · 获胜');
    expect(html).toContain('评委');
    expect(html).not.toContain('再来一局');
    expect(html).toContain('--roster-columns:3');
    const withActions = renderToStaticMarkup(<MemoryRouter><ResultPanel result={result} view={view} summary={summary} onReplay={() => {}} /></MemoryRouter>);
    expect(withActions).toContain('同玩法再开一局');
    const reusable = { ...summary, seats: summary.seats.map((seat) => ({ ...seat, playerId: seat.seat })) };
    expect(renderToStaticMarkup(<MemoryRouter><ResultPanel result={result} view={view} summary={reusable} /></MemoryRouter>)).toContain('同样阵容再来一局');
    expect(withActions).toContain('从头回放');
    expect(withActions).toContain('href="/play/debate"');
  });

  it('renders the result dialog as a fixed, full-viewport overlay whose only grid item is the card', () => {
    // 修复依赖的结构：对话框根元素就是遮罩，卡片是它唯一的直接子元素（第二个子元素会多出一条轨道，居中就不成立）；
    // 遮罩铺满视口、层级 60、单列 minmax(0, 1fr)（隐式 auto 轨道会被卡片的长文本撑到比视口宽，再居中就把卡片推出左边缘）
    const result = { winner: 'pro', winnerLabel: '正方胜出', summary: '很长的摘要 '.repeat(60), mvp: 1, endReason: 'normal' as const };
    const html = renderToStaticMarkup(<ResultPanel result={result} view={view} onClose={() => {}} />);
    expect(html.startsWith('<section class="result-panel" role="dialog"')).toBe(true);
    expect(html.match(/class="result-card/g)).toHaveLength(1);
    expect(html).toMatch(/^<section[^>]*><div class="result-card/);
    expect(html.endsWith('</div></section>')).toBe(true);
    // vitest 把 CSS 导入替换成空串，样式契约直接读文件（测试运行在 node 环境）
    const css = readFileSync(new URL('./components/ResultPanel.css', import.meta.url), 'utf8');
    const overlay = css.slice(css.indexOf('.result-panel {'), css.indexOf('}', css.indexOf('.result-panel {')));
    expect(overlay).toContain('position: fixed;');
    expect(overlay).toContain('inset: 0;');
    expect(overlay).toContain('z-index: 60;');
    expect(overlay).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(overlay).toContain('align-content: safe center;');
  });

  it('reveals the roster row by row and uses the seat portrait for the MVP', () => {
    const result = { winner: 'pro', winnerLabel: '正方胜出', summary: '', mvp: 1, endReason: 'normal' as const };
    const roster = renderToStaticMarkup(<ResultRoster view={view} result={result} />);
    expect(roster).toContain('--roster-rows:3');
    expect(roster).toContain('--i:0');
    expect(roster).toContain('--i:2');
    expect(roster).toMatch(/result-roster-team is-winner" data-team="pro"/);
    // 获胜方按座位：组内只有部分座位获胜时逐行标出，整组不亮
    const mixed: AudienceView = { ...view, seats: [seat(1, 'werewolf', 1), seat(2, 'werewolf', 1), seat(3, 'good', 1), seat(4, 'good', 1)] };
    const split = renderToStaticMarkup(<ResultRoster view={mixed} result={{ ...result, winner: 'lovers', winners: [1, 3] }} />);
    expect(split).not.toContain('is-winner" data-team');
    expect(split.match(/<li class="(is-out )?is-winner"/g)).toHaveLength(2);
    expect(split.match(/ · 获胜/g)).toHaveLength(2);
    const noPoster = renderToStaticMarkup(<ResultPanel result={result} view={view} />);
    expect(noPoster).toContain('result-mvp-placeholder');
    expect(noPoster).toContain('result-mvp-seat');
    expect(noPoster).not.toContain('avatar-figure');
    const posterView: AudienceView = { ...view, seats: [{ ...seat(1, 'pro', 1), name: '豆包' }, seat(2, 'con', 1)] };
    const withPoster = renderToStaticMarkup(<ResultPanel result={result} view={posterView} />);
    expect(withPoster).toContain('/player-posters/doubao.webp');
    const mvp = { ...seat(8, 'con'), name: '08 号模拟玩家' };
    const renderMvp = (avatar: string | null) => renderToStaticMarkup(<ResultPanel result={{ ...result, mvp: 8 }} view={{ ...view, seats: [{ ...mvp, avatar }] }} />);
    expect(renderMvp(null)).toContain('/player-posters/yuanbao.webp');
    expect(renderMvp('/custom.png')).toContain('src="/custom.png"');
  });

  it('presents the result as a modal dialog with a close control only when it can be closed', () => {
    const result = { winner: 'pro', winnerLabel: '正方胜出', summary: '', mvp: null, endReason: 'normal' as const };
    const dialog = renderToStaticMarkup(<ResultPanel result={result} view={view} onClose={() => {}} />);
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain('aria-labelledby="result-winner"');
    expect(dialog).toContain('aria-label="关闭结果"');
    expect(renderToStaticMarkup(<ResultPanel result={result} view={view} />)).not.toContain('关闭结果');
  });

  it('cycles focus inside the dialog with Tab and Shift+Tab', () => {
    expect(nextFocusIndex(3, -1, false)).toBe(0);
    expect(nextFocusIndex(3, -1, true)).toBe(2);
    expect(nextFocusIndex(3, 2, false)).toBe(0);
    expect(nextFocusIndex(3, 0, true)).toBe(2);
    expect(nextFocusIndex(0, -1, false)).toBe(-1);
  });
});

describe('ring geometry', () => {
  it('brings seats 4 and 10 inward with the rounder ring while keeping their animation anchors aligned', () => {
    const arena = {width:2400,height:1000};
    const previousBox = fitRingBox(arena,2.2), roundBox = fitRingBox(arena);
    const card = {width:144,height:184};
    const previous = ringGeometry(12,previousBox,card), round = ringGeometry(12,roundBox,card);
    expect(roundBox.width / roundBox.height).toBe(1.7);
    const anchors = seatAnchors(Array.from({length:12},(_,i)=>i+1),round);
    for (const index of [3,9]) {
      expect(Math.abs(round.seats[index]!.x-roundBox.width/2)).toBeLessThan(Math.abs(previous.seats[index]!.x-previousBox.width/2));
      expect(anchors.get(index+1)).toEqual(round.seats[index]);
    }
  });
  it('uses spare width beside the speech surface without losing reading height', () => {
    const box = { width: 1600, height: 750 };
    const geometry = ringGeometry(12, box, { width: 144, height: 184 });
    const speech = speechBox(box, geometry);
    expect(speech.width).toBeGreaterThan(speech.height * 2.3);
    expect(speech.height).toBeGreaterThan(300);
  });

  it.each([6, 9, 12, 16])('keeps the speech surface clear of all %i seat buttons', (count) => {
    const box = { width: 1000, height: 600 };
    const geometry = ringGeometry(count, box, { width: 144, height: 184 });
    const speech = speechBox(box, geometry);
    expect(speech.height).toBeGreaterThan(0);
    for (const seat of geometry.seats) {
      const gapX = Math.abs(seat.x - box.width / 2) - (speech.width + geometry.card.width) / 2;
      const gapY = Math.abs(seat.y - box.height / 2) - (speech.height + geometry.card.height) / 2;
      expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(5.99);
    }
  });

  const card = { width: 118, height: 140 };
  const adjacentOverlap = (geometry: ReturnType<typeof ringGeometry>) =>
    geometry.seats.some((seat, index) => {
      const next = geometry.seats[(index + 1) % geometry.seats.length];
      return next !== undefined && Math.abs(seat.x - next.x) < geometry.card.width && Math.abs(seat.y - next.y) < geometry.card.height;
    });

  it('fits 12 seats around the ring at a 1280×720 stage by shrinking the cards instead of overlapping', () => {
    const geometry = ringGeometry(12, { width: 734, height: 432 }, card);
    expect(geometry.seats).toHaveLength(12);
    expect(adjacentOverlap(geometry)).toBe(false);
    expect(geometry.scale).toBeLessThan(1);
    expect(geometry.scale).toBeGreaterThanOrEqual(0.6);
  });

  it('fits the ring inside an arena narrower than 1.7 × its height, keeping every card inside the box', () => {
    // 记录侧栏展开：1024 宽的舞台只剩 632 × 469，圆桌不能再按 1.7 比例撑到 797 宽
    expect(fitRingBox({ width: 632, height: 469 })).toEqual({ width: 632, height: 469 });
    expect(fitRingBox({ width: 976, height: 469 })).toEqual({ width: 797, height: 469 });
    const geometry = ringGeometry(12, fitRingBox({ width: 632, height: 469 }), card);
    for (const point of geometry.seats) {
      expect(point.x - geometry.card.width / 2).toBeGreaterThanOrEqual(0);
      expect(point.x + geometry.card.width / 2).toBeLessThanOrEqual(632);
      expect(point.y - geometry.card.height / 2).toBeGreaterThanOrEqual(0);
      expect(point.y + geometry.card.height / 2).toBeLessThanOrEqual(469);
    }
    expect(geometry.scale).toBeGreaterThanOrEqual(0.6);
  });

  it('maps seat numbers to their ring anchors in view order', () => {
    const geometry = ringGeometry(3, { width: 600, height: 400 }, card);
    const anchors = seatAnchors([5, 7, 9], geometry);
    expect(anchors.get(5)).toEqual(geometry.seats[0]);
    expect(anchors.get(9)).toEqual(geometry.seats[2]);
    expect(anchors.get(1)).toBeUndefined();
  });

  it('keeps full-size cards when there is room and places seat 1 at the top, going clockwise', () => {
    const geometry = ringGeometry(12, { width: 1200, height: 774 }, card);
    expect(geometry.scale).toBe(1);
    expect(adjacentOverlap(geometry)).toBe(false);
    const [first, second] = geometry.seats;
    expect(first?.x).toBeCloseTo(600, 5);
    expect(first?.y).toBeCloseTo(card.height / 2, 5);
    expect(second?.x ?? 0).toBeGreaterThan(first?.x ?? 0);
    expect(ringGeometry(1, { width: 400, height: 300 }, card).seats).toHaveLength(1);
  });
});
