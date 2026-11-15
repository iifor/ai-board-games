import { announcementProblem, formatAnnouncement, type AnnouncementItem } from '@battle/shared';
import { useEffect, useState } from 'react';
import { announcements } from '../../services/announcements';
import { errorMessage } from '../../services/http';

export function useAnnouncementPreview(item: AnnouncementItem, source: string) {
  const [result, setResult] = useState<{ source: string; preview: string | null; problem: string | null }>();
  const { engineTemplate, key } = item;
  useEffect(() => {
    if (!engineTemplate || !source) return;
    let active = true;
    const timer = setTimeout(() => {
      announcements.preview(key, source).then(
        ({ text }) => { if (active) setResult({ source, preview: text, problem: null }); },
        error => { if (active) setResult({ source, preview: null, problem: errorMessage(error) }); },
      );
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [engineTemplate, key, source]);

  if (!engineTemplate) {
    const problem = announcementProblem(source, item.examples);
    return { problem, preview: problem ? null : formatAnnouncement(source, item.examples) };
  }
  if (!source) return { problem: '请输入播报内容', preview: null };
  return result?.source === source ? result : { preview: null, problem: null };
}
