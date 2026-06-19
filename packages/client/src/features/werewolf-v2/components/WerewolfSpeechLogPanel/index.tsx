import { Mic2, Radio, ScrollText, Vote } from 'lucide-react';
import { formatWerewolfSeatLabel } from '../../../werewolf/utils';
import type { EventLogEntry, Player, SpeechState } from '../../../../types';
import './index.css';

interface WerewolfSpeechLogPanelProps {
  eventLog: EventLogEntry[];
  activeSpeech: SpeechState | null;
  players: Player[];
}

const SPEECH_EVENT_KINDS = new Set([
  'speech',
  'wolf-speech',
  'self-destruct',
  'sheriff-speech',
  'sheriff-runoff-speech',
  'last-words',
  'exile-words',
  'workflow-event',
  'day-start',
  'night-result',
  'vote-result',
  'sheriff-result',
  'phase-start'
]);

export function WerewolfSpeechLogPanel({ eventLog, activeSpeech, players }: WerewolfSpeechLogPanelProps) {
  const entries = eventLog
    .filter((entry) => SPEECH_EVENT_KINDS.has(entry.kind) || Boolean(entry.text))
    .slice(-10)
    .reverse();
  const activeSpeakerLabel = activeSpeech?.playerId ? formatWerewolfSeatLabel(activeSpeech.playerId, players) : '主持人';

  return (
    <section className="werewolf-v2-speech-log" aria-label="发言记录">
      <header className="werewolf-v2-speech-log__header">
        <strong><Mic2 size={18} />发言记录</strong>
        <nav aria-label="记录分类">
          <span className="active"><Mic2 size={14} />发言</span>
          <span><Vote size={14} />投票</span>
          <span><ScrollText size={14} />淘汰</span>
          <span><Radio size={14} />系统</span>
        </nav>
      </header>

      <div className="werewolf-v2-speech-log__list">
        {activeSpeech && (
          <article className="werewolf-v2-speech-log__item is-live">
            <div>
              <span className="werewolf-v2-speech-log__avatar">{activeSpeakerLabel.slice(0, 1)}</span>
              <strong>{activeSpeakerLabel}</strong>
              <em>发言中</em>
            </div>
            <p>{activeSpeech.text || activeSpeech.fullText || '正在组织发言...'}</p>
          </article>
        )}

        {entries.length ? entries.map((entry) => (
          <article className="werewolf-v2-speech-log__item" key={entry.id}>
            <div>
              <span className="werewolf-v2-speech-log__icon">{entry.icon}</span>
              <strong>{entry.title || '系统播报'}</strong>
            </div>
            <p>{entry.text}</p>
          </article>
        )) : !activeSpeech ? (
          <div className="werewolf-v2-speech-log__empty">
            <Radio size={22} />
            <strong>暂无发言记录</strong>
            <span>开局后会同步显示发言、遗言与系统播报。</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
