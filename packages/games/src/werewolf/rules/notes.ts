import type { WerewolfState } from '../state';

/** 追加一条法官私下告诉该座位的固定信息（state.seatNotes，规则层展示给本人） */
export function addSeatNote(state: WerewolfState, seat: number, text: string): WerewolfState {
  const notes = state.seatNotes[String(seat)] ?? [];
  return { ...state, seatNotes: { ...state.seatNotes, [String(seat)]: [...notes, text] } };
}
