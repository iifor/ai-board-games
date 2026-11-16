import { API_ERROR_CODES, type GameCatalogItem, type PublicPlayerDto } from '@battle/shared';
import { useState } from 'react';
import { ApiError, errorMessage } from '../../../services/http';
import { createLocalDebugMatch, createMatch } from '../../../services/matches';
import { GAMES_WITH_TOPIC } from '../constants';
import type { SetupInitial, TopicDraft } from '../types';
import { fillOpenSeats, playerRange, selectionHint, toggleSelection } from '../utils';

export type { SetupInitial, TopicDraft } from '../types';

function initialVariant(game: GameCatalogItem, initial: SetupInitial | undefined): string | null {
  const wanted = initial?.variant;
  return wanted && game.variants.some((variant) => variant.key === wanted) ? wanted : game.defaultVariant;
}

function initialSelection(players: readonly PublicPlayerDto[], initial: SetupInitial | undefined, max: number): number[] {
  const known = new Set(players.map((player) => player.id));
  return (initial?.playerIds ?? []).filter((id) => known.has(id)).slice(0, max);
}

export interface MatchSetupOptions {
  /** 服务端不认可开局凭证（未输码、停用、过期或已换码），由调用方清除凭证并重新要码 */
  readonly onAccessRejected?: (reason: string) => void;
}

/** 开局表单状态：板子、玩家（按选中顺序就座）、可选辩题；提交后返回对局 ID */
export function useMatchSetup(game: GameCatalogItem, players: readonly PublicPlayerDto[], initial?: SetupInitial, options: MatchSetupOptions = {}) {
  const [variant, setVariant] = useState<string | null>(() => initialVariant(game, initial));
  const [selected, setSelected] = useState<number[]>(() => initialSelection(players, initial, playerRange(game, initialVariant(game, initial)).max));
  const [topic, setTopic] = useState<TopicDraft>({ title: '', pro: '', con: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const range = playerRange(game, variant);
  const hint = selectionHint(selected.length, range);
  const topicComplete = topic.title.trim() && topic.pro.trim() && topic.con.trim();
  const topicPartial = !topicComplete && (topic.title.trim() || topic.pro.trim() || topic.con.trim());

  const randomFill = Boolean(game.seatGroups?.length);
  const fill = (): number[] => {
    const added = fillOpenSeats(players.map((player) => player.id), selected, range.max, randomFill);
    setSelected([...selected, ...added]);
    return added;
  };

  /** 真实玩家开局需要身份码凭证；本地模拟开局不需要 */
  const submit = async (mode: 'players' | 'generated', token?: string): Promise<string | null> => {
    if (submitting || topicPartial || (mode === 'players' && (hint || !token))) return null;
    setSubmitting(true);
    setError(null);
    try {
      const params = GAMES_WITH_TOPIC.has(game.key) && topicComplete ? { topic: { title: topic.title.trim(), pro: topic.pro.trim(), con: topic.con.trim() } } : undefined;
      const request = { gameKey: game.key, variant: variant ?? undefined, params };
      const match = mode === 'generated'
        ? await createLocalDebugMatch(request)
        : await createMatch({ ...request, playerIds: selected }, token ?? '');
      return match.id;
    } catch (cause) {
      if (mode === 'players' && cause instanceof ApiError && cause.code === API_ERROR_CODES.unauthorized && options.onAccessRejected) {
        options.onAccessRejected(cause.message);
        return null;
      }
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
    fill,
    randomFill,
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
