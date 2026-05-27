import { useEffect, useMemo, useState } from 'react';
import { adminRequest } from '../services/adminApi';
import type { Player } from '../types/entities';

/** 玩家信息：昵称 + 游戏内序号（基于 sort_order 的座位号） */
export function usePlayerNicknames() {
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    adminRequest<Player[]>('/players')
      .then((list) => setPlayers(list))
      .catch(() => {/* ignore */});
  }, []);

  // 按 sort_order ASC, id ASC 排序 → 数组位置即为座位号
  const sorted = useMemo(() =>
    [...players].sort((a, b) => {
      const soA = (a as unknown as Record<string, number>).sort_order ?? 0;
      const soB = (b as unknown as Record<string, number>).sort_order ?? 0;
      if (soA !== soB) return soA - soB;
      return a.id - b.id;
    }),
  [players]);

  // playerId → 座位号 (1-indexed)
  const seatMap = useMemo(() => {
    const m = new Map<number, number>();
    sorted.forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }, [sorted]);

  // playerId → 昵称
  const nicknameMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of players) {
      m.set(p.id, p.nickname || p.name || `${p.id}号`);
    }
    return m;
  }, [players]);

  /** 获取玩家昵称，找不到时回退为 "N号" */
  const getNickname = (playerId: number | undefined | null): string => {
    if (!playerId) return '';
    return nicknameMap.get(playerId) || `${playerId}号`;
  };

  /** 获取游戏内座位号（序号），找不到时回退为 playerId */
  const getSeatNumber = (playerId: number | undefined | null): number => {
    if (!playerId) return 0;
    return seatMap.get(playerId) ?? playerId;
  };

  /** 获取带序号的玩家显示名，如 "12号-Meta" */
  const getPlayerLabel = (playerId: number | undefined | null): string => {
    if (!playerId) return '';
    const seat = getSeatNumber(playerId);
    const nick = getNickname(playerId);
    return `${seat}号-${nick}`;
  };

  return { nicknames: nicknameMap, seatMap, getNickname, getSeatNumber, getPlayerLabel };
}
