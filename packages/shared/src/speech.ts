import type { StageEvent } from './stage';

/** 朗读内容：文本与发声座位（主持播报为 null） */
export interface SpeechContent {
  readonly text: string;
  readonly seat: number | null;
}

export type PlayerSpeech = Extract<StageEvent, { kind: 'speech' }> | (Extract<StageEvent, { kind: 'judgement' }> & { source?: never });

export function isPlayerSpeech(event: StageEvent | undefined): event is PlayerSpeech {
  return event?.kind === 'speech' || (event?.kind === 'judgement' && !event.source);
}

/** 上警、退水选择只在座位上展示，不生成逐人播报。 */
export function isSheriffChoice(event: StageEvent | undefined): event is Extract<StageEvent, { kind: 'action' }> & { readonly phaseId: 'sheriff_signup' | 'sheriff_withdraw' } {
  return event?.view.gameKey === 'werewolf' && event.kind === 'action'
    && (event.phaseId === 'sheriff_signup' || event.phaseId === 'sheriff_withdraw');
}

export function isSheriffSignup(event: StageEvent | undefined): event is Extract<StageEvent, { kind: 'action' }> & { readonly phaseId: 'sheriff_signup' } {
  return isSheriffChoice(event) && event.phaseId === 'sheriff_signup';
}

// 旧回放没有 announcement 标记；使用当时写入的结构化动效标题，避开公开台词和玩家发言。
const legacyDawnOutcomes = new Set(['狼刀命中', '毒药生效', '恶灵反伤', '暗杀命中', '魅惑连锁',
  '摄梦生效', '交易反噬', '情侣殉情', '第三方击杀', '狩猎结算',
  '解药生效 · 挡下狼刀', '守护成功 · 挡下狼刀', '梦游避开狼刀']);

function announcedAtDawn(event: Extract<StageEvent, { kind: 'revealed' }>): boolean {
  if (event.view.gameKey !== 'werewolf' || event.channel !== 'spectator') return false;
  const { announcement, effect, target, title } = event.data;
  if (announcement === 'dawn') return true;
  if (typeof target !== 'number' || typeof title !== 'string') return false;
  return (event.phaseId === 'night_resolve' && legacyDawnOutcomes.has(title))
    || (effect === 'inspect' && (title === '熊咆哮了' || title === '熊没有咆哮'));
}

/**
 * 哪些舞台事件要朗读、读什么：服务端据此合成语音，客户端据此决定是否朗读与朗读文本，两边只认这一处。
 * 评委点评连同判定一起读；行动（开枪、自爆……）与播报、揭示、终局总结由主持人声音读；
 * 有台词的阶段由主持人朗读；普通标题、计票、出局提示、兜底记录、上警和退水选择只展示。
 */
export function speechOf(event: StageEvent): SpeechContent | null {
  if (isSheriffChoice(event)) return null;
  switch (event.kind) {
    case 'phase_started':
      return event.announcement ? { text: event.announcement, seat: null } : null;
    case 'speech':
      return { text: event.text, seat: event.seat };
    case 'judgement':
      if (event.source === 'fallback') return { text: `${event.comment}结果为${event.verdictLabel}。`, seat: null };
      return { text: event.verdictLabel ? `${event.verdictLabel}。${event.comment}` : event.comment, seat: event.seat };
    case 'narration':
      return { text: event.text, seat: null };
    case 'revealed':
      return announcedAtDawn(event) ? null : { text: event.text, seat: null };
    case 'action':
      if (event.view.gameKey === 'werewolf' && event.phaseId === 'speech_direction' && !event.source) return null;
      if (event.view.gameKey === 'werewolf' && event.phaseId === 'day_speech' && event.action === '自爆' && event.text === '宣布自爆') {
        return { text: `${event.seat}号自爆。`, seat: null };
      }
      return { text: event.source ? `${event.seat}号，${event.text}` : event.text, seat: null };
    case 'game_over':
      if (event.view.extra.winnerAnnounced === true && event.view.gameKey === 'werewolf') {
        return { text: '本局复盘结束。', seat: null };
      }
      return { text: event.result.summary, seat: null };
    default:
      return null;
  }
}
