import { sql } from 'kysely';
import { expect, it } from 'vitest';
import type { ForgetMemoryResult, PlayerMemoryPage } from '@battle/shared';
import { reviewRepository } from '../src/modules/player-memory/reviewRepository';
import { scriptedLlm, seedPlayers } from './support/fixtures';
import { createTestApp, dataOf, type TestApp } from './support/testApp';

async function seedMemory(t: TestApp, matchId: string, ownerId: number, gameKey: string, previousId: number | null = null) {
  return t.db.insertInto('playerMemories').values({ ownerId, matchId, gameKey, subjectId: null, subjectName: null,
    phaseId: null, action: null, content: '旧观察', evidence: '[]', outcome: 'unresolved', requestId: null, previousId })
    .returning('id').executeTakeFirstOrThrow();
}

async function finish(t: TestApp, matchId: string) {
  for (let attempt = 0; attempt < 150; attempt++) {
    await t.services.repositories.matches.markAcked(matchId, 1_000_000);
    await t.services.worker.idle();
    const match = await t.services.repositories.matches.find(matchId);
    if (match?.status === 'completed') return;
    expect(match?.status).not.toBe('failed');
  }
  throw new Error('测试局未完成');
}

it('forgets one owned record without reactivating its prior version, then clears all pages and games for that player', async () => {
  const t = await createTestApp();
  try {
    const token = await t.adminToken();
    const players = await seedPlayers(t, 9);
    const [owner, other] = [players[0]!, players[1]!];
    const source = await t.services.matches.createDebug({ gameKey: 'debate', playerIds: players, scripted: true });
    const previous = await seedMemory(t, source.id, owner, 'debate');
    const leaf = await seedMemory(t, source.id, owner, 'debate', previous.id);
    const keep = await seedMemory(t, source.id, other, 'debate');
    for (let i = 0; i < 12; i++) await seedMemory(t, source.id, owner, 'werewolf');
    const path = '/api/admin/player-memory/players/' + owner;
    const one = path + '/memories/' + leaf.id;
    const del = (p: string) => t.call<ForgetMemoryResult>('DELETE', p, { token });
    expect((await t.call('DELETE', path)).status).toBe(401);
    expect((await t.call('DELETE', one)).status).toBe(401);
    expect((await del(path + '/memories/' + keep.id)).status).toBe(404);
    expect((await del(path + '/memories/not-an-id')).status).toBe(400);
    expect(dataOf(await del(one))).toEqual({ forgotten: 1, cancelledReviews: 0 });
    expect(dataOf(await del(one)).forgotten).toBe(0);
    const partial = dataOf(await t.call<PlayerMemoryPage>('GET', path + '?gameKey=debate', { token }));
    expect(partial.records.map(m => m.id)).toEqual([previous.id]);
    const next = await t.services.matches.createPublic({ gameKey: 'debate', playerIds: players }, (await t.access()).grant);
    const snapshot = await t.services.repositories.matches.snapshot(next.id);
    expect(snapshot?.playerMemories?.[owner]).toEqual([]);
    expect(snapshot?.playerMemories?.[other]?.map(m => m.id)).toEqual([keep.id]);

    const repo = reviewRepository(t.db);
    const job = { matchId: source.id, ownerId: owner, seat: 1, attempts: 1 };
    await t.db.insertInto('playerMemoryReviews').values({ ...job, status: 'running' }).execute();
    const revision = { previousId: leaf.id, content: '迟到修订', evidence: [], subjectId: null, subjectName: null,
      phaseId: null, action: null, outcome: 'unresolved' as const, requestId: null };
    await repo.finish(job, 'debate', [revision]);
    expect((await t.services.playerMemory.player(owner, 0, 1)).total).toBe(13);
    expect(dataOf(await del(path))).toEqual({ forgotten: 13, cancelledReviews: 0 });
    expect(dataOf(await del(path)).forgotten).toBe(0);
    expect((await t.services.playerMemory.player(owner, 0, 10)).total).toBe(0);
    expect((await t.services.playerMemory.player(other, 0, 10)).total).toBe(1);
    expect(await t.services.matches.log(source.id)).not.toHaveLength(0);
    expect(await t.db.selectFrom('playerMemories').select(['content', 'evidence', 'forgotten']).where('id', '=', leaf.id)
      .executeTakeFirst()).toEqual({ content: '', evidence: [], forgotten: true });
  } finally { await t.cleanup(); }
});

it('fences already-running, queued and pre-reset active matches while allowing new matches to learn again', async () => {
  const t = await createTestApp({}, { llm: scriptedLlm() });
  try {
    const token = await t.adminToken();
    const players = await seedPlayers(t, 9);
    const owner = players[0]!;
    const normal = async () => t.services.matches.createPublic({ gameKey: 'debate', playerIds: players }, (await t.access()).grant);
    const first = await normal();
    const historical = await seedMemory(t, first.id, owner, 'debate');
    const concurrent = await normal();
    await t.db.updateTable('matches').set({ snapshot: sql`snapshot - 'memoryGenerations'` }).where('id', '=', concurrent.id).execute();
    t.services.worker.start();
    await finish(t, first.id);
    const repo = reviewRepository(t.db);
    const job = { matchId: first.id, ownerId: owner, seat: 1, attempts: 1 };
    await t.db.updateTable('playerMemoryReviews').set({ status: 'running', attempts: 1 })
      .where('matchId', '=', first.id).where('ownerId', '=', owner).execute();
    const model = (await t.services.repositories.aiTasks.seatModel(first.id, 1))!;
    const call = (await repo.beginCall(job, model, false))!;
    const queued = await t.services.matches.createDebug({ gameKey: 'debate', playerIds: players, scripted: true });
    await t.db.insertInto('playerMemoryReviews').values({ matchId: queued.id, ownerId: owner, seat: 1 }).execute();

    expect(dataOf(await t.call<ForgetMemoryResult>('DELETE', '/api/admin/player-memory/players/' + owner, { token })))
      .toEqual({ forgotten: 1, cancelledReviews: 2 });
    const memory = { previousId: null, content: '新经验', evidence: [], subjectId: null, subjectName: null, phaseId: null,
      action: null, outcome: 'unresolved' as const, requestId: null };
    await repo.finish(job, 'debate', [memory], call);
    await repo.retry(job);
    expect(await repo.beginCall(job, model, false)).toBeNull();
    expect((await t.services.playerMemory.calls(owner, 0, 10)).records[0]?.status).toBe('superseded');
    expect((await t.services.playerMemory.player(owner, 0, 10)).total).toBe(0);
    expect((await t.services.repositories.matches.snapshot(concurrent.id))?.playerMemories?.[owner]?.[0]?.id).toBe(historical.id);
    await finish(t, concurrent.id);
    const jobs = (id: string) => t.db.selectFrom('playerMemoryReviews').selectAll().where('matchId', '=', id);
    expect((await jobs(concurrent.id).execute()).map(j => j.ownerId).sort()).toEqual(players.slice(1).sort());
    const fresh = await normal();
    expect((await t.services.repositories.matches.snapshot(fresh.id))?.playerMemories?.[owner]).toEqual([]);
    await finish(t, fresh.id);
    expect(await jobs(fresh.id).where('ownerId', '=', owner).executeTakeFirst()).toMatchObject({ status: 'queued' });
    await t.db.updateTable('playerMemoryReviews').set({ status: 'running', attempts: 1 })
      .where('matchId', '=', fresh.id).where('ownerId', '=', owner).execute();
    await repo.finish({ ...job, matchId: fresh.id }, 'debate', [memory]);
    expect((await t.services.playerMemory.player(owner, 0, 10)).records[0]?.content).toBe('新经验');
  } finally { await t.cleanup(); }
}, 60_000);
