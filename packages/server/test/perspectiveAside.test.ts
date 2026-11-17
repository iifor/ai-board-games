import { speechOf, type AudienceView, type StageEvent } from '@battle/shared';
import { describe, expect, it } from 'vitest';
import { forPlayerSeat } from '../src/modules/realtime/perspective';

const view: AudienceView = {
  gameKey: 'werewolf', title: 'AI 狼人杀', round: 1, phase: null, status: 'running', seats: [], extra: {}, result: null,
};
const aside: StageEvent = {
  kind: 'speech', seat: 3, purpose: 'aside', text: '这瓶毒我赌在 5 号身上', seq: 9, round: 1, phaseId: 'witch_poison', channel: 'spectator', view,
};

describe('key-action asides on stage', () => {
  it('are voiced by the speaker and reach only the speaker among single-seat perspectives', () => {
    expect(speechOf(aside)).toEqual({ text: aside.text, seat: 3 });
    expect(forPlayerSeat(aside, 3)).not.toBeNull();
    expect(forPlayerSeat(aside, 5)).toBeNull();
    // 只认观战频道的心里话：其他观战频道事件仍不给单座位视角
    expect(forPlayerSeat({ ...aside, kind: 'revealed', text: '结算', data: {} }, 3)).toBeNull();
  });
});
