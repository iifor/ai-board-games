import { expect, it } from 'vitest';
import type { LlmClient } from '../src/modules/llm';
import { loadMemoryBank } from '../src/modules/player-memory/repository';
import { answerFor, seedPlayers } from './support/fixtures';
import { createTestApp, type TestApp } from './support/testApp';

async function finish(t: TestApp, id: string) {
  for (let i = 0; i < 150; i++) {
    await t.services.repositories.matches.markAcked(id, 1_000_000);
    await t.services.worker.idle();
    const row = await t.services.repositories.matches.find(id);
    if (row?.status === 'completed') return;
    expect(row?.status).not.toBe('failed');
  }
  throw new Error('测试局未完成');
}

it('clears the model\'s private judgement from player decisions when the trace is deleted', async () => {
  const llm: LlmClient = { complete: async (request) => {
    const output = JSON.parse(answerFor(request)) as Record<string, unknown>;
    return { content: JSON.stringify({ ...output, memoryNote: { judgement: '我私下怀疑三号', evidence: [], cited: [] } }), usage: null };
  } };
  const t = await createTestApp({}, { llm });
  try {
    const token = await t.adminToken();
    const ids = await seedPlayers(t, 9);
    t.services.worker.start();
    const match = await t.services.matches.createPublic({ gameKey: 'debate', playerIds: ids }, 'retention');
    await finish(t, match.id);
    const notes = async () => (await t.db.selectFrom('playerDecisions').select('note').where('matchId', '=', match.id).execute()).map((row) => row.note);
    const before = await notes();
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((note) => note.judgement === '我私下怀疑三号')).toBe(true);
    expect((await t.call('DELETE', '/api/admin/traces/' + match.id, { token })).status).toBe(200);
    const after = await notes();
    expect(after.every((note) => note.judgement === '')).toBe(true);
    // 选择本身与游戏日志一致，留给记忆复盘
    expect(after.map((note) => note.choice)).toEqual(before.map((note) => note.choice));
  } finally {
    await t.cleanup();
  }
});

it('keeps a memory hidden after the match that revised it is deleted', async () => {
  const t = await createTestApp({});
  try {
    const ids = await seedPlayers(t, 9);
    const owner = ids[0]!;
    const create = () => t.services.matches.createDebug({ gameKey: 'debate', playerIds: ids, pacing: 'free', seed: 7 });
    const [first, second] = [await create(), await create()];
    const memory = (matchId: string, content: string, previousId: number | null = null) => t.db.insertInto('playerMemories').values({
      ownerId: owner, matchId, gameKey: 'debate', subjectId: null, subjectName: null, phaseId: null, action: null,
      content, evidence: '[]', requestId: null, outcome: 'unresolved', previousId,
    }).returning('id').executeTakeFirstOrThrow();
    const original = await memory(first.id, '对方总是先陈述观点');
    const revision = await memory(second.id, '上次的判断被推翻了', original.id);
    const unrelated = await memory(second.id, '只来自第二局的经验');
    const visible = async () => (await t.db.transaction().execute((tx) => loadMemoryBank(tx, [owner], 'debate'))).playerMemories[owner]!.map((card) => card.id);
    expect(await visible()).toEqual([unrelated.id, revision.id]);

    await t.services.matches.remove(second.id);
    // 修正版随对局删除，但被推翻的旧记忆不能因此重新进入提示词
    expect(await visible()).toEqual([]);
    const rows = await t.db.selectFrom('playerMemories').select(['id', 'matchId', 'forgotten', 'content']).where('ownerId', '=', owner).orderBy('id').execute();
    expect(rows).toEqual([
      { id: original.id, matchId: first.id, forgotten: false, content: '对方总是先陈述观点' },
      { id: revision.id, matchId: null, forgotten: true, content: '' },
    ]);
  } finally {
    await t.cleanup();
  }
});
