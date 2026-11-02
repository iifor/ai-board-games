import type { GameCatalogItem, PublicPlayerDto } from '@battle/shared';
import { useState } from 'react';
import { errorMessage } from '../../../services/http';
import { createMatch } from '../../../services/matches';
import { GAMES_WITH_TOPIC } from '../constants';
import type { SetupInitial, TopicDraft } from '../types';
import { playerRange, selectionHint, toggleSelection } from '../utils';

export type { SetupInitial, TopicDraft } from '../types';

function initialVariant(game: GameCatalogItem, initial: SetupInitial | undefined): string | null {
  const wanted = initial?.variant;
  return wanted && game.variants.some((variant) => variant.key === wanted) ? wanted : game.defaultVariant;
}

function initialSelection(players: readonly PublicPlayerDto[], initial: SetupInitial | undefined, max: number): number[] {
  const known = new Set(players.map((player) => player.id));
  return (initial?.playerIds ?? []).filter((id) => known.has(id)).slice(0, max);
}

/** 开局表单状态：板子、玩家（按选中顺序就座）、可选辩题；提交后返回对局 ID */
export function useMatchSetup(game: GameCatalogItem, players: readonly PublicPlayerDto[], initial?: SetupInitial) {
  const [variant, setVariant] = useState<string | null>(() => initialVariant(game, initial));
  const [selected, setSelected] = useState<number[]>(() => initialSelection(players, initial, playerRange(game, initialVariant(game, initial)).max));
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
