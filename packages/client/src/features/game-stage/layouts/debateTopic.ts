import type { AudienceView } from '@battle/shared';

export function debateTopicOf(view: AudienceView | null) {
  const topic = view?.extra.topic;
  if (!topic || typeof topic !== 'object') return null;
  return {
    title: 'title' in topic && typeof topic.title === 'string' ? topic.title.trim() : '',
    pro: 'pro' in topic && typeof topic.pro === 'string' ? topic.pro.trim() : '',
    con: 'con' in topic && typeof topic.con === 'string' ? topic.con.trim() : '',
  };
}
