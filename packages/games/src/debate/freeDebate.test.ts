import type { AiRequest } from '@battle/engine';
import { runToEnd, scriptedAgent, type AgentReply } from '@battle/engine/testing';
import { describe, expect, it } from 'vitest';
import { debateGame } from './spec';
import type { DebateState } from './state';

function play(reply: (request: AiRequest, index: number) => AgentReply) {
  const debug = scriptedAgent(debateGame);
  const turns: number[] = [];
  const run = runToEnd(debateGame, { seed: 15, playerCount: 9, agent(request, snapshot) {
    if (request.phaseId !== 'free_debate') return debug(request, snapshot);
    if (request.attempt === 1) turns.push(request.seat);
    return reply(request, turns.length - 1);
  } });
  expect(run.requests.some(r => r.request.phaseId === 'closing')).toBe(true);
  return { ...run, turns, ledger: (run.snapshot.state as DebateState).freeDebate! };
}
describe('自由辩论', () => {
  it('按可见正文字数用满双方预算，保留每人的首发机会，单方耗尽后继续', () => {
    const run = play(request => {
      const limit = Number(request.prompt.instruction.match(/本次正文最多 (\d+) 字/u)?.[1]);
      const count = Math.min(limit, request.seat <= 4 ? 150 : 70);
      return { output: { speech: '[短停]' + '好'.repeat(count), questionTo: request.seat <= 4 ? 5 : 1 } };
    });
    for (const side of [run.ledger.pro, run.ledger.con]) {
      expect(side.remaining).toBe(0);
      expect(new Set(side.turns).size).toBe(4);
      expect(side.failedSeats).toEqual([]);
      expect(side.turns.some((id, i, arr) => arr[i+1] === id && arr[i+2] === id)).toBe(false);
    }
    expect(run.turns.slice(-2).every(id => id > 4)).toBe(true);
  });
  it('首轮让过释放预留，余额不足 150 字时只准使用实际余额', () => {
    const run = play((r, i) => {
      const cap = Number(r.prompt.instruction.match(/本次正文最多 (\d+) 字/u)?.[1]);
      if (i === 0 || r.seat > 4) return { output: { speech: r.seat > 4 && i === 1 ? '应' : null } };
      return { output: { speech: '文'.repeat(cap) } };
    });
    expect(run.ledger.pro.remaining).toBe(0);
    expect(run.ledger.con.remaining).toBe(999);
    expect(run.requests.some(({ request }) => request.prompt.instruction.includes('本次正文最多 100 字'))).toBe(true);
  });
  it('追问优先，连续占两席后轮换，连续让过不扣字', () => {
    let first = 0;
    const run = play((r, i) => {
      if (!i) first = r.seat;
      if (i === 4) {
        expect(r.prompt.instruction).toContain(`你是正方${r.seat}号`);
        expect(r.prompt.instruction).toContain(`替正方${first}号回答反方6号的追问。对方刚才说：「第4问？」`);
      } else {
        expect(r.prompt.instruction).not.toContain('本轮请替');
      }
      return { output: i < 4 ? { speech: `[短停]第${i + 1}问？`, questionTo: i % 2 ? first : 6 } : { speech: null } };
    });
    expect(run.turns.slice(0, 4)).toEqual([first, 6, first, 6]);
    expect(run.turns).toHaveLength(6);
    expect(run.turns[4]).not.toBe(first);
    expect(run.turns[5]).not.toBe(6);
    expect(run.ledger.pro.remaining).toBe(992);
    expect(run.ledger.con.remaining).toBe(992);
  });
  it('一方剩19字后停发，另一方剩20字仍可发言，双方不足20字直接总结', () => {
    const run = play(r => {
      const remaining = Number(r.prompt.instruction.match(/你方剩余 (\d+) 字/u)?.[1]);
      expect(remaining).toBeGreaterThanOrEqual(20);
      const goal = r.seat <= 4 || remaining === 20 ? 19 : 20;
      const count = Math.min(r.seat <= 4 ? 150 : 100, remaining - goal);
      return { output: { speech: '文'.repeat(count), questionTo: r.seat <= 4 ? 5 : 1 } };
    });
    expect(run.ledger.pro.remaining).toBe(19);
    expect(run.ledger.con.remaining).toBe(19);
    expect(run.turns.slice(-2).every(id => id > 4)).toBe(true);
    const final = run.requests.filter(({ request }) => request.phaseId === 'free_debate').at(-1)!.request;
    expect(final.prompt.instruction).toContain('你方剩余 20 字');
    expect(final.prompt.instruction).not.toContain('本轮请替');
  });
  it('技术失败交棒，同队成功发言后可再次被点名', () => {
    let failedSeat = 0;
    const run = play((r, i) => {
      if (i === 0) {
        failedSeat = r.seat;
        return { failed: 'network' };
      }
      return { output: i < 5 ? { speech: '答', questionTo: failedSeat } : { speech: null } };
    });
    expect(run.turns[2]).not.toBe(failedSeat);
    expect(run.turns[4]).toBe(failedSeat);
    expect(run.ledger.pro.remaining).toBe(998);
  });
  it('重试不重复扣费，失败不冒充主动让过；全部失败也可结束', () => {
    const run = play((r, i) => {
      if (i === 0 && r.attempt === 2) return { output: { speech: '答' } };
      return { output: { speech: '字'.repeat(151) } };
    });
    expect(run.ledger.pro.remaining).toBe(999);
    expect(run.ledger.con.remaining).toBe(1000);
    expect(run.ledger.pro.failedSeats).toHaveLength(4);
    expect(run.ledger.con.failedSeats).toHaveLength(4);
    expect(run.log.filter(e => e.kind === 'narration' && e.text.includes('本轮未能发言'))).toHaveLength(8);
  });
});
