import { describe, expect, it } from 'vitest';
import { play, type Override } from './helpers';

function firstNight(answer: Override) {
  const run = play(11, (request, snapshot) => snapshot.round === 1 ? answer(request, snapshot) : undefined);
  const requests = run.requests.filter(r => r.snapshot.round === 1).map(r => r.request);
  return { run, chat: requests.filter(r => r.phaseId === 'wolf_chat'), votes: requests.filter(r => r.phaseId === 'wolf_kill') };
}

describe('狼人夜聊定向回应', () => {
  it('同意或仅改刀口时直接投刀', () => {
    const change = '我有不同意见，改刀 7 号。';
    const { chat, votes } = firstNight(request => request.phaseId === 'wolf_chat'
      ? { speech: request.id.includes(':t2:') ? change : '同意。' } : undefined);
    expect(chat.map(r => r.taskTemplate?.name)).toEqual(Array(4).fill('wolfChat'));
    expect(chat[0]?.outputSchema.required).toEqual(['speech']);
    expect(votes).toHaveLength(4);
    expect(chat[1]!.prompt.history).not.toContain(change);
    expect(chat[3]!.prompt.history).toContain(change);
    for (const vote of votes) expect(vote.prompt.history).toContain(change);
  });

  it('尚未发言的人在正常轮次确认，已发言的人只补一次，多个分工合并', () => {
    const order: number[] = [];
    const { run, chat, votes } = firstNight((request, snapshot) => {
      if (request.phaseId !== 'wolf_chat') return;
      if (request.taskTemplate?.name === 'wolfChatReply') {
        return { speech: '我可以核票，但不同意替你追问。', replyRequests: [{ seat: order[1], task: '再回我一次' }] };
      }
      order.push(request.seat);
      const pack = snapshot.seats.filter(s => s.team === 'werewolf');
      if (order.length === 2) {
        const later = pack.find(s => !order.includes(s.seat))!.seat;
        return { speech: '明天帮我核票、盯发言。', replyRequests: [
          { seat: order[0], task: '帮我核票' }, { seat: order[0], task: '帮我核票' }, { seat: later, task: '盯发言' },
          { seat: request.seat, task: '点自己' }, { seat: 99, task: '点非队友' }, { seat: '坏字段' },
        ] };
      }
      if (order.length === 4) return { speech: '再帮我追问跳预言家的人。', replyRequests: [{ seat: order[0], task: '追问预言家' }] };
      return { speech: '同意。' };
    });
    expect(chat.map(r => r.seat)).toEqual([...order, order[0]]);
    const reply = chat.at(-1)!;
    expect(reply.taskTemplate?.name).toBe('wolfChatReply');
    expect(reply.prompt.instruction.match(/帮我核票/g)).toHaveLength(1);
    expect(reply.prompt.instruction).toContain('追问预言家');
    expect(reply.outputSchema.properties).not.toHaveProperty('replyRequests');
    expect(chat.slice(2, 4).some(r => r.prompt.instruction.includes('盯发言'))).toBe(true);
    expect(chat.every(r => r.attempt === 1)).toBe(true);
    expect(votes).toHaveLength(order.length);
    const assignment = `请${order[0]}号确认「追问预言家」`;
    const replyText = '我可以核票，但不同意替你追问。';
    expect(reply.prompt.history).toContain(assignment);
    for (const vote of votes) {
      expect(vote.prompt.history).toContain(assignment);
      expect(vote.prompt.history).toContain(replyText);
      expect(vote.prompt.history).not.toMatch(/点非队友|点自己|再回我一次/);
    }
    expect(run.log.filter(e => e.kind === 'speech' && e.text === replyText).map(e => e.channel)).toEqual(['team:werewolf']);
    const seer = run.requests.find(r => r.request.phaseId === 'seer_check')!;
    expect(seer.request.prompt.history).not.toContain(assignment);
    expect(seer.request.prompt.history).not.toContain(replyText);
    expect(run.requests.filter(r => r.snapshot.round === 2 && r.request.taskTemplate?.name === 'wolfChatReply')).toHaveLength(0);
  });

  it('最后一位点名两名队友时，分别补一次', () => {
    const order: number[] = [];
    const { chat } = firstNight(request => {
      if (request.taskTemplate?.name !== 'wolfChat') return;
      order.push(request.seat);
      if (order.length === 4) return { speech: '明天请你们分别追问。',
        replyRequests: order.slice(0, 2).map(seat => ({ seat, task: '追问票型' })) };
      return { speech: '同意。' };
    });
    expect(chat.filter(r => r.taskTemplate?.name === 'wolfChatReply').map(r => r.seat)).toEqual(order.slice(0, 2));
  });

  it('点名回应失败时，兜底不会代队友答应配合', () => {
    const order: number[] = [];
    const { run, votes } = firstNight(request => {
      if (request.taskTemplate?.name === 'wolfChatReply') return { speech: '' };
      if (request.taskTemplate?.name !== 'wolfChat') return;
      order.push(request.seat);
      return order.length === 4
        ? { speech: '明天请帮我追问。', replyRequests: [{ seat: order[0], task: '明天帮我追问' }] }
        : { speech: '同意。' };
    });
    const speeches = run.log.filter(e => e.kind === 'speech' && e.round === 1 && e.phaseId === 'wolf_chat');
    expect(speeches).toHaveLength(5);
    const missed = '过~';
    expect(speeches.at(-1)).toMatchObject({ seat: order[0], channel: 'team:werewolf', text: missed });
    expect(votes.every(r => r.prompt.history.includes(missed))).toBe(true);
    expect(run.requests.find(r => r.request.phaseId === 'seer_check')?.request.prompt.history).not.toContain(missed);
    expect(votes).toHaveLength(4);
  });
});
