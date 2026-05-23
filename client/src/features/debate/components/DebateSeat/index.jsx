import React from 'react';
import { Crown } from 'lucide-react';
import { classNames } from '../../../../utils/classNames';
import { getPlayerAvatar, getPlayerModelName } from '../../../../utils/player';
import { toChineseOrdinal } from '../../debateUtils';
import './index.css';

function formatAvatarUrl(value) {
  const src = String(value || '').trim();
  if (!src) return '';
  if (/^(https?:|data:|blob:|\/)/i.test(src)) return src;
  return `/avatars/${src}`;
}

export function DebateSeat({ player, currentSpeakerId, slotLabel, onPlayerSelect, tone = 'pro', index = 0, mvpVoteTarget = '', isMvp = false }) {
  const isSpeaking = player && Number(currentSpeakerId) === Number(player.id);
  const isJudge = tone === 'judge';
  const isCaptain = !isJudge && player?.debateRole === 'captain';
  const name = player?.nickname || player?.name;
  const modelName = getPlayerModelName(player);
  return (
    <article className={classNames('debate-seat', tone, isSpeaking && 'speaking', isMvp && 'mvp-seat', !player && 'empty')}>
      <div
        className="debate-avatar player-detail-trigger"
        style={getPlayerAvatar(player) ? { backgroundImage: `url("${formatAvatarUrl(getPlayerAvatar(player))}")` } : undefined}
        onClick={() => player && onPlayerSelect?.(player)}
        aria-label={player ? `查看${name}信息` : `${slotLabel}席位空缺`}
      >
        {!getPlayerAvatar(player) && <span className="avatar-sprite" />}
        {isCaptain && <span className="captain-avatar-badge">队长</span>}
        {isMvp && <span className="mvp-avatar-badge"><Crown size={18} strokeWidth={3} />最佳</span>}
      </div>
      <div className="debate-nameplate">
        <span className="seat-badge">{isJudge ? slotLabel : `${toChineseOrdinal(index + 1)}辩`}</span>
        <strong>
          {name || slotLabel}
        </strong>
        {modelName && <small className="seat-model-name">{modelName}</small>}
        {isMvp && <span className="seat-mvp-badge">本场最佳辩手</span>}
        {mvpVoteTarget && <span className="seat-mvp-vote">投 {mvpVoteTarget}</span>}
      </div>
    </article>
  );
}
