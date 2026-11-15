import { isSheriffChoice, type AudienceView, type StageLayout } from '@battle/shared';
import { useMemo, type ReactNode } from 'react';
import { voteFlightOf, type VoteFlight } from '../animation/ballotFlight';
import { prefersReducedMotion } from '../animation/motion';
import { LAYOUTS } from '../layouts/registry';
import { isPlayerSpeech } from '../playback/speechTurns';
import type { SegmentControl } from '../playback/segment';
import type { SeatSelectHandler, StreamItem } from '../types';
import { judgeBadges, periodOf } from '../utils';
import { StageCenter } from './StageCenter';
import { NightTransition } from './NightTransition';
import { DebateBroadcast } from './DebateBroadcast';
import { SpeechCarousel } from './SpeechCarousel';
import { skillCue } from '../animation/skillCue';
import { SkillEffect } from './SkillEffect';
import { sheriffSignup } from '../animation/sheriffSignup';
import { skillMarks } from '../animation/skillMarks';

interface StageProps {
  readonly record?: ReactNode;
  readonly layout: StageLayout;
  readonly view: AudienceView | null;
  readonly current: StreamItem | null;
  readonly played: readonly StreamItem[];
  /** 当前这段的播放控制：选票飞行按它的倍速缩放时长 */
  readonly control?: SegmentControl | null | undefined;
  /** 点击座位卡片：打开座位资料弹层（由舞台页持有弹层状态） */
  readonly onSeatSelect?: SeatSelectHandler | undefined;
  readonly selectedSeat?: number | null | undefined;
  readonly playbackPaused?: boolean;
  readonly playbackSpeed?: number;
}

/** 正在播的计票 → 选票飞行安排（布局有座位坐标时才飞；票板等飞完再长条） */
function voteFlight(layout: StageLayout, current: StreamItem | null, control: SegmentControl | null): VoteFlight | null {
  const event = current?.event;
  if (!event || event.kind !== 'vote_tallied' || !LAYOUTS[layout].ballotFlight) return null;
  return voteFlightOf(event, control?.rate ?? null, prefersReducedMotion());
}

/** 按游戏声明的布局渲染座位；中央放立绘、票板等舞台内容，座位徽章来自已播放的事件，昼夜与选票飞行也在这里算出交给布局 */
export function Stage({ layout, view, current, played, control = null, onSeatSelect, selectedSeat = null, record,
  playbackPaused = false, playbackSpeed = 1 }: StageProps) {
  // 同一段只算一次：布局按 vote 的引用缓存飞行计划
  const vote = useMemo(() => voteFlight(layout, current, control), [layout, current, control]);
  const history = useMemo(() => played.map((item) => item.event), [played]);
  const cue = useMemo(() => current && !isSheriffChoice(current.event) ? skillCue(current.event, history) : null, [current, history]);
  const marks = useMemo(() => skillMarks(current ? [...history, current.event] : history), [current, history]);
  if (!view) return <p className="stage-waiting">等待对局开始…</p>;
  const { Component: Layout } = LAYOUTS[layout];
  const event = current?.event;
  const shown = event ?? played.at(-1)?.event;
  const night = view.gameKey === 'werewolf' && periodOf(view) === 'night' && view.status === 'running';
  const nightTransition = night && (!event || (event.channel === 'public' &&
    (event.kind === 'phase_started' || event.kind === 'narration' && event.phaseId === 'night_start')));
  const speech = isPlayerSpeech(shown) ? shown : null;
  const signup = sheriffSignup(view, played, current, control?.rate ?? 1);
  const badges = { ...judgeBadges(played) };
  for (const seat of signup.candidates) badges[seat] = [...(badges[seat] ?? []), '上警'];
  let center;
  if (record) {
    center = record;
  } else if (nightTransition) {
    center = <NightTransition round={view.round} call={shown} paused={playbackPaused} speed={playbackSpeed} />;
  } else if (isSheriffChoice(shown)) {
    center = null;
  } else if (speech) {
    center = <SpeechCarousel current={speech} control={control} />;
  } else if (layout === 'versus') {
    center = <DebateBroadcast view={view} current={current} played={played} control={control} />;
  } else if (cue && event) {
    center = layout === 'circle' ? null : <SkillEffect key={event.seq} cue={cue} rate={control?.rate ?? 1} />;
  } else {
    center = <StageCenter view={view} current={current} played={played} voteDelayMs={vote?.timing.totalMs ?? 0} />;
  }
  return (
    <Layout
      view={view}
      speaking={nightTransition ? null : speech?.seat ?? null}
      period={periodOf(view)}
      vote={record || cue ? null : vote}
      cue={nightTransition ? null : cue}
      cueSeq={event?.seq}
      control={control}
      skillMarks={marks}
      badges={badges}
      signup={signup.choice}
      onSeatSelect={onSeatSelect}
      selectedSeat={selectedSeat}
      center={center}
    />
  );
}
