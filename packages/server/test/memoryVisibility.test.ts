import { createSnapshot, recallPlayerMemory, type EngineSnapshot, type LogEntry } from '@battle/engine';
import { gameRegistry } from '@battle/games';
import { expect, it } from 'vitest';
import { interpretReview, reviewMaterial } from '../src/modules/player-memory/reflection';

it('freezes werewolf evidence at issue time across private channels, team changes and public reveals', () => {
  const game = gameRegistry.get('werewolf')!;
  const base = createSnapshot(game, { seed: 7, players: Array.from({ length: 12 }, (_, i) => ({
    playerId: String(i + 1), name: '玩家' + (i + 1), avatar: null, persona: '',
  })) });
  const viewer = { ...base.seats[0]!, team: 'wolves', teamSince: 4 };
  const line = (seq: number, channel: LogEntry['channel']): LogEntry =>
    ({ seq, round: 1, phaseId: 'discussion', kind: 'speech', seat: 2, channel, text: '发言' + seq });
  const snapshot: EngineSnapshot = { ...base, playerMemories: { '1': [] }, log: [
    line(1, 'team:wolves'), line(2, 'spectator'), line(3, 'private:2'), line(4, 'team:wolves'),
    line(5, 'private:1'), line(6, 'public'), line(7, 'host'),
  ] };
  const context = recallPlayerMemory(snapshot, viewer, 'vote')!;
  expect(context.evidence.map(e => e.seq)).toEqual([4, 5, 6]);
  snapshot.log.push({ kind: 'revealed', seq: 8, round: 1, phaseId: 'end', channel: 'public', text: '2号公布身份', data: {} });
  expect(context.throughSeq).toBe(7);
  const result = reviewMaterial(snapshot, 1, [{
    matchId: 'test', requestId: 'vote', action: 'vote', phaseId: 'vote', round: 1, throughSeq: context.throughSeq,
    choice: '投票 2', judgement: '我怀疑2号', evidence: context.evidence, offered: [], cited: [],
  }]);
  expect(result.evidence.map(e => e.seq)).toEqual([4, 5, 6, 8]);
  const claim = { content: '下次先问清依据', subjectSeat: 2, evidence: [6], requestId: 'vote',
    previousId: null, outcome: 'contradicted' };
  expect(interpretReview({ memories: [claim] }, result)[0]?.outcome).toBe('unresolved');
  expect(interpretReview({ memories: [{ ...claim, evidence: [6, 8] }] }, result)[0]?.outcome).toBe('contradicted');
  expect(() => interpretReview({ memories: [{ ...claim, evidence: [1] }] }, result)).toThrow('未提供');
});
