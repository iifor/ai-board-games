import React from 'react';
import { Hand, Star } from 'lucide-react';
import { formatAvatarUrl } from '../../../../utils/avatar';
import { classNames } from '../../../../utils/classNames';
import { ROLE_NAMES } from '../../constants';
import './index.css';

export function WerewolfSeat({ player, seatIndex, actionTarget, isSheriff, isSheriffCandidate, showRoles, visibleRolePlayerId, currentSpeakerId, onPlayerSelect }) {
  const isSpeaking = Number(currentSpeakerId) === Number(player.id);
  const roleText = player.roleLabel || ROLE_NAMES[player.role] || '';
  return (
    <article
      className={classNames('werewolf-seat', isSpeaking && 'speaking', !player.alive && 'dead', showRoles && player.role)}
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
            <Hand size={18} />
          </span>
        )}
        {isSheriff && (
          <span className="werewolf-sheriff-badge" title="警长" aria-label="警长">
            <Star size={19} fill="currentColor" />
          </span>
        )}
        {!player.alive && <span className="werewolf-dead-badge">出局</span>}
      </div>
      {actionTarget && <span className="werewolf-action-badge" title={`投给 ${actionTarget} 号`}>{actionTarget}</span>}
      <div className="werewolf-nameplate">
        <strong>{player.nickname || player.name || `${player.id}号`}</strong>
        <br />
        <span>{roleText}</span>
      </div>
    </article>
  );
}
