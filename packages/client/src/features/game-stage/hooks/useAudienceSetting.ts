import { useState } from 'react';

function read(key: string) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function save(key: string, value: string) {
  try { sessionStorage.setItem(key, value); } catch { /* 禁用存储时仍可在本次观看中切换。 */ }
}

export function useAudienceSetting(matchId: string, seats: readonly { readonly seat: number }[]) {
  const [assigned] = useState(() => {
    const key = 'stage-seat:' + matchId;
    const cached = Number(read(key));
    if (seats.some((s) => s.seat === cached)) return cached;
    const seat = seats[Math.floor(Math.random() * seats.length)]?.seat ?? null;
    if (seat !== null) save(key, String(seat));
    return seat;
  });
  const [player, setPlayer] = useState(() => read('stage-perspective') === 'player');
  const [afterSeq, setAfterSeq] = useState(0);
  function switchMode(next: boolean, after: number) {
    save('stage-perspective', next ? 'player' : 'god');
    setAfterSeq(after);
    setPlayer(next);
  }
  return { seat: player ? assigned : null, afterSeq, switchMode };
}
