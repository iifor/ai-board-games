import { Activity, ArrowRight, Crown, Eye, Mic2, Moon, Skull, Sun, Target, Users } from 'lucide-react';
import { PlayerAvatar } from '../../../../components/common/BaseModal';
import { classNames } from '../../../../utils/classNames';
import { ROLE_NAMES } from '../../../werewolf/constants';
import { formatWerewolfSeatLabel, getWerewolfSeatNumber } from '../../../werewolf/utils';
import type { Player, SpeechState, WerewolfRound } from '../../../../types';
import { getWerewolfInteractionStatusText, resolveNightAwakeLabel, resolveWerewolfSpeechSpeaker, resolveWerewolfStageNarrative, type WerewolfInteractionState } from '../../utils/interactionState';
import './index.css';

export function PerspectiveHeader({ round, alive, eliminated }: { round: WerewolfRound | null; alive: number; eliminated: number }) {
  const night = round?.phase === 'night';
  return <header className="perspective-header" aria-live="polite">
    <div>
      {night ? <Moon size={20} /> : <Sun size={20} />}
      <span><strong>{round ? `第${round.day || 1}天 · ${night ? '夜晚' : '白天'}` : '游戏准备'}</strong><small className="perspective-header__stats"><span><Users size={13} />存活 <b>{alive}</b></span><span><Skull size={13} />出局 <b>{eliminated}</b></span></small></span>
    </div>
  </header>;
}

export function PerspectiveModeLabel({ modeName }: { modeName: string }) {
  return <aside className="perspective-mode-label" aria-label="游戏模式">
    <strong>{modeName}</strong>
  </aside>;
}

interface RosterProps {
  players: Player[]; side: 'left' | 'right'; interaction: WerewolfInteractionState; speakerId: string | null;
  sheriffId: string | number | null; candidateIds: Set<number>; revealRoles: boolean; viewerPlayerId?: string | number | null;
  onSelect: (player: Player) => void;
}

export function PerspectiveRoster({ players, side, interaction, speakerId, sheriffId, candidateIds, revealRoles, viewerPlayerId, onSelect }: RosterProps) {
  return <section className={classNames('perspective-roster', `perspective-roster--${side}`)} aria-label={`${side === 'left' ? '左' : '右'}侧玩家席位`}>
    {players.map((player, index) => {
      const id = Number(player.id);
      const speaking = id === Number(speakerId);
      const actor = interaction.actorIds.includes(id);
      const target = interaction.targetIds.includes(id);
      const own = id === Number(viewerPlayerId);
      const showRole = revealRoles || own;
      const status = speaking ? '发言中' : target ? '行动目标' : actor ? '正在行动' : !player.alive ? '已出局' : '';
      return <button type="button" className={classNames('perspective-seat', speaking && 'is-speaking', actor && 'is-acting', target && 'is-target', own && 'is-viewer', !player.alive && 'is-dead')} onClick={() => onSelect(player)} key={player.id}>
        <b>{side === 'left' ? index + 1 : index + 7}</b>
        <PlayerAvatar player={player} className="perspective-seat__avatar" />
        <span><strong>{player.nickname || player.name || `${id}号玩家`}</strong>{showRole && <small>{ROLE_NAMES[player.role || ''] || player.roleLabel || '身份未知'}</small>}</span>
        {status && <i>{speaking && <Mic2 size={12} />}{status}</i>}
        <em>{Number(sheriffId) === id && <Crown size={15} aria-label="警长" />}{candidateIds.has(id) && <Users size={15} aria-label="警上玩家" />}</em>
      </button>;
    })}
  </section>;
}

export function InteractionStage({ interaction, players, speech, view, round }: { interaction: WerewolfInteractionState; players: Player[]; speech: SpeechState | null; view: 'god' | 'player'; round: WerewolfRound | null }) {
  const actors = interaction.actorIds.map((id) => formatWerewolfSeatLabel(id, players));
  const targets = interaction.targetIds.map((id) => formatWerewolfSeatLabel(id, players));
  const idle = !round;
  const showFlow = actors.length > 0 || targets.length > 0;
  const night = round?.phase === 'night';
  const sheriffAction = interaction.action.startsWith('sheriff_');
  const narrative = resolveWerewolfStageNarrative(speech, interaction.detail);
  const speaker = resolveWerewolfSpeechSpeaker(speech, players);
  const animationKey = `${interaction.action}:${interaction.status}:${interaction.actorIds.join('-')}:${interaction.targetIds.join('-')}`;
  return <main className={classNames('interaction-stage', speech && 'is-speech', night && 'is-night')} data-tone={interaction.tone} data-template={interaction.template} data-action={interaction.action} data-status={interaction.status}>
    <section className="interaction-stage__card" aria-live="polite" key={animationKey}>
      {night && <div className="interaction-stage__night-cue"><Eye size={18} />{resolveNightAwakeLabel(interaction.action)}</div>}
      {sheriffAction && <div className="interaction-stage__sheriff-cue"><Crown size={17} />警长竞选</div>}
      <span className="interaction-stage__status"><Activity size={14} />{idle ? '等待开始' : getWerewolfInteractionStatusText(interaction.status)}</span>
      <h1>{idle ? '选择模式并开始游戏' : interaction.title}</h1>
      {speaker && <div className="interaction-stage__speaker" aria-label={`当前发言：${getWerewolfSeatNumber(speaker.id, players)}号 ${speaker.nickname || speaker.name || '玩家'}`}>
        <PlayerAvatar player={speaker} className="interaction-stage__speaker-avatar" />
        <Mic2 className="interaction-stage__speaker-mic" size={17} aria-hidden="true" />
        <span><small>{getWerewolfSeatNumber(speaker.id, players)}号</small><strong>{speaker.nickname || speaker.name || '玩家'}</strong></span>
      </div>}
      <div className={classNames('interaction-stage__narrative', `is-${narrative.kind}`)}>
        {narrative.label && <small>{narrative.label}</small>}
        <p>{narrative.text}</p>
      </div>
      {showFlow && <div className="interaction-stage__flow" aria-label="技能作用关系">
        {actors.length > 0 && <article><small>{interaction.template === 'speech' ? '当前发言' : '行动者'}</small><strong>{actors.join(' · ')}</strong></article>}
        {actors.length > 0 && targets.length > 0 && <ArrowRight size={22} aria-hidden="true" />}
        {targets.length > 0 && <article className="is-target"><small><Target size={13} />作用目标</small><strong>{targets.join(' · ')}</strong></article>}
      </div>}
      {view === 'god' && round?.phase === 'day' && <div className="interaction-stage__facts"><span>已投票 <b>{Object.keys(round.votes || {}).length}</b></span><span>警长 <b>{round.sheriffId ? formatWerewolfSeatLabel(round.sheriffId, players) : '未产生'}</b></span></div>}
    </section>
  </main>;
}
