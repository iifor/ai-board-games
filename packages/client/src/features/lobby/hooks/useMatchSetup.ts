import type { GameCatalogItem, PublicPlayerDto } from '@battle/shared';
import { useState } from 'react';
import { errorMessage } from '../../../services/http';
import { createMatch } from '../../../services/matches';
import { GAMES_WITH_TOPIC } from '../constants';
import { playerRange, selectionHint, toggleSelection } from '../utils';

export interface TopicDraft {
  readonly title: string;
  readonly pro: string;
  readonly con: string;
}

/** 开局表单状态：板子、玩家（按选中顺序就座）、可选辩题；提交后返回对局 ID */
export function useMatchSetup(game: GameCatalogItem, players: readonly PublicPlayerDto[]) {
  const [variant, setVariant] = useState<string | null>(game.defaultVariant);
  const [selected, setSelected] = useState<number[]>([]);
  const [topic, setTopic] = useState<TopicDraft>({ title: '', pro: '', con: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const range = playerRange(game, variant);
  const hint = selectionHint(selected.length, range);
  const topicComplete = topic.title.trim() && topic.pro.trim() && topic.con.trim();
  const topicPartial = !topicComplete && (topic.title.trim() || topic.pro.trim() || topic.con.trim());

  const fillRandom = () => {
    const pool = players.map((player) => player.id).filter((id) => !selected.includes(id));
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setSelected([...selected, ...shuffled].slice(0, range.max));
  };

  const submit = async (): Promise<string | null> => {
    if (hint || topicPartial) return null;
    setSubmitting(true);
    setError(null);
    try {
      const params = GAMES_WITH_TOPIC.has(game.key) && topicComplete ? { topic: { title: topic.title.trim(), pro: topic.pro.trim(), con: topic.con.trim() } } : undefined;
      const match = await createMatch({ gameKey: game.key, variant: variant ?? undefined, playerIds: selected, params });
      return match.id;
    } catch (cause) {
      setError(errorMessage(cause));
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    variant,
    setVariant,
    selected,
    toggle: (id: number) => setSelected((prev) => toggleSelection(prev, id)),
    fillRandom,
    clear: () => setSelected([]),
    topic,
    setTopic,
    range,
    hint,
    topicPartial: Boolean(topicPartial),
    submitting,
    error,
    submit,
  };
}
