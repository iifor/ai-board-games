import React from 'react';
import { Eye, FlaskConical, Hand, Shield, Star, Swords } from 'lucide-react';
import { formatAvatarUrl } from '../../../../utils/avatar';
import { classNames } from '../../../../utils/classNames';
import { ROLE_NAMES } from '../../constants';
import './index.css';

export function WerewolfSeat({ player, seatIndex, actionTarget, nightActionBadges = [], isNightActor, seerInspectionTarget, isSheriff, isSheriffCandidate, showRoles, visibleRolePlayerId, currentSpeakerId, onPlayerSelect }) {
  const isSpeaking = Number(currentSpeakerId) === Number(player.id);
  const roleText = ROLE_NAMES[player.roleLabel] || player.roleLabel || ROLE_NAMES[player.role] || '';
  const isWerewolfPlayer = player.role === 'werewolf' || player.faction === 'wolves';
  const hasVisibleSafeFaction = showRoles && !isWerewolfPlayer && Boolean(player.faction || player.role);
  return (
    <article
      className={classNames(
        'werewolf-seat',
        isSpeaking && 'speaking',
        isNightActor && 'night-actor',
        isSheriffCandidate && 'sheriff-candidate',
        !player.alive && 'dead',
        showRoles && player.role,
        showRoles && isWerewolfPlayer && 'danger-faction',
        hasVisibleSafeFaction && 'safe-faction'
      )}
      style={{}}
    >
      <div
        className="werewolf-avatar player-detail-trigger"
        style={player.avatar ? { backgroundImage: `url("${formatAvatarUrl(player.avatar)}")` } : undefined}
        onClick={() => onPlayerSelect?.(player)}
        aria-label={`查看${player.nickname || player.name || `${player.id}号`}信息`}
      >
        {!player.avatar && (player.nickname || player.name || `${player.id}`).slice(0, 1)}
        <span className="werewolf-seat-number">{player.id}</span>
        {isSheriffCandidate && (
          <span className="werewolf-sheriff-candidate-badge" title="警长竞选" aria-label="举手">
            <Hand size={30} />
          </span>
        )}
        {isSheriff && (
          <span className="werewolf-sheriff-badge" title="警长" aria-label="警长">
            <Star size={19} fill="currentColor" />
          </span>
        )}
        {nightActionBadges.length > 0 && (
          <div className="werewolf-night-action-badges">
            {nightActionBadges.map((badge, badgeIndex) => (
              <span
                className={classNames('werewolf-night-action-badge', badge.kind, badge.theme?.className)}
                style={badge.theme?.style}
                title={badge.title}
                key={`${badge.kind}-${badge.target || badge.label || badgeIndex}`}
              >
                {getNightBadgeIcon(badge.kind, 30, '#fff1a1')}
                {badge.prefix && <b>{badge.prefix}</b>}
                {badge.target && <b>{badge.target}号</b>}
                {!badge.target && badge.label && <b>{badge.label}</b>}
                {badge.result && <em>{badge.result}</em>}
              </span>
            ))}
          </div>
        )}
        {!player.alive && <span className="werewolf-dead-badge">出局</span>}
      </div>
      {actionTarget && <span className="werewolf-action-badge" title={`投给 ${actionTarget} 号`}>{actionTarget}</span>}
      <div className="werewolf-nameplate">
        <strong>{player.nickname || player.name || `${player.id}号`}</strong>
        <br />
        <span className={classNames(showRoles && isWerewolfPlayer && 'danger')}>{roleText}</span>
      </div>
    </article>
  );
}

function getNightBadgeIcon(kind, size = 13, color = '#fff') {
  if (kind === 'wolf') return <Swords size={size} color={color} />;
  if (kind === 'guard') return <Shield size={size} color={color} />;
  if (kind === 'seer') return <Eye size={size} color={color} />;
  return <FlaskConical size={size} color={color} />;
}
