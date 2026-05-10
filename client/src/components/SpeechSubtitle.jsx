import React, { useEffect, useMemo, useState } from 'react';
import '../styles/speech-subtitle.css';

export function SpeechSubtitle({ speech }) {
  const chunks = useMemo(() => splitSubtitleText(speech?.text || ''), [speech?.text]);
  const [chunkIndex, setChunkIndex] = useState(0);

  useEffect(() => {
    setChunkIndex(0);
  }, [speech?.text]);

  useEffect(() => {
    if (chunks.length <= 1) return undefined;
    const current = chunks[chunkIndex] || '';
    const timer = window.setTimeout(() => {
      setChunkIndex((index) => Math.min(index + 1, chunks.length - 1));
    }, getSubtitleDuration(current));
    return () => window.clearTimeout(timer);
  }, [chunks, chunkIndex]);

  if (!speech?.text) return null;

  return (
    <aside className="speech-subtitle" aria-live="polite">
      <p>{chunks[chunkIndex] || speech.text}</p>
    </aside>
  );
}

function splitSubtitleText(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const sentenceParts = clean
    .split(/(?<=[。！？!?；;，,])/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks = [];
  let current = '';
  for (const part of sentenceParts.length ? sentenceParts : [clean]) {
    if (countSubtitleUnits(current + part) <= 34) {
      current += part;
      continue;
    }
    if (current) chunks.push(current);
    if (countSubtitleUnits(part) > 34) chunks.push(...hardSplitSubtitle(part, 34));
    else current = part;
  }
  if (current) chunks.push(current);
  return chunks;
}

function hardSplitSubtitle(text, maxUnits) {
  const chunks = [];
  let current = '';
  for (const char of text) {
    if (countSubtitleUnits(current + char) > maxUnits && current) {
      chunks.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function countSubtitleUnits(text) {
  return Array.from(text).reduce((sum, char) => sum + (/[\x00-\xff]/.test(char) ? 0.55 : 1), 0);
}

function getSubtitleDuration(text) {
  const units = countSubtitleUnits(text);
  return Math.max(3200, Math.min(9000, units * 280 + 900));
}
