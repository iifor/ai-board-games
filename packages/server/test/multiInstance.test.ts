import { API_ERROR_CODES, type MatchSummaryDto } from '@battle/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JOB_LOCKS, jobLock } from '../src/db/locks';
import { createAiWorker, createTaskExecutor } from '../src/modules/ai-worker';
import { createTtsService, type TtsProvider, type VoiceChoice } from '../src/modules/tts';
import { fakeTts, scriptedLlm, seedPlayers } from './support/fixtures';
import { listen, watch } from './support/stream';
import { ADMIN, createTestApp, type TestApp } from './support/testApp';

/** 两个实例共用一个 schema：A 跑 worker，B 只服务观众；两边的兜底轮询都拉到 60 秒，事件必须靠跨实例通知送达 */
let a: TestApp;
let b: TestApp;
let serverB: Awaited<ReturnType<typeof listen>>;
const llm = scriptedLlm();
const tts = fakeTts();
const slow = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  const overrides = { realtime: { pollMs: 60_000 }, matches: { maxActive: 100, idleMs: 30 * 60_000 } };
  a = await createTestApp(overrides, { llm, ttsProviders: { azure: tts } });
  b = await createTestApp(overrides, { llm, ttsProviders: { azure: tts } }, { schema: a.schema });
  serverB = await listen(b);
});
afterAll(async () => {
  await serverB.close();
  await b.cleanup();
  await a.cleanup();
});

describe('event bus across instances', () => {
  it('delivers an event emitted on one instance to the other exactly once, and locally exactly once', async () => {
    expect(a.services.instanceId).not.toBe(b.services.instanceId);
    const onA: string[] = [];
    const onB: string[] = [];
    const offA = a.services.bus.on('match:status', (payload) => onA.push(payload.status));
    const offB = b.services.bus.on('match:status', (payload) => onB.push(payload.status));
    a.services.bus.emit('match:status', { matchId: 'm_x', status: 'from-a' });
    const started = Date.now();
    while (!onB.length && Date.now() - started < 5000) await slow(10);
    expect(onB).toEqual(['from-a']);
    expect(Date.now() - started).toBeLessThan(2000);
    await slow(100);
    // A 自己发的通知从数据库绕回来时被实例 ID 过滤掉，本地监听者只收到一次
    expect(onA).toEqual(['from-a']);
    offA();
    offB();
  });

  it('wakes a viewer on B for events produced by the worker on A, and wakes the worker on A for acks on B', async () => {
    // A 上的 worker 兜底轮询同样拉到 60 秒：ack 节奏下每一步都要靠 B 的 ack 通知唤醒它
    const executor = createTaskExecutor({
      tasks: a.services.repositories.aiTasks,
      matches: a.services.repositories.matches,
      providers: a.services.providers,
      models: a.services.models,
      llm,
      findGame: a.services.games.find,
      sleep: async () => {},
    });
    const worker = createAiWorker({ tasks: a.services.repositories.aiTasks, executor, runtime: a.services.runtime, bus: a.services.bus }, {
      concurrency: 2, maxAttempts: 3, pollMs: 60_000,
    });
    const eventsOnB: number[] = [];
    const acksOnA: number[] = [];
    const offB = b.services.bus.on('match:events', (payload) => eventsOnB.push(payload.lastSeq));
    const offA = a.services.bus.on('match:acked', (payload) => acksOnA.push(payload.seq));
    worker.start();
    try {
      const playerIds = await seedPlayers(b, 9);
      const match = await b.services.matches.createDebug({ gameKey: 'debate', playerIds, scripted: true, pacing: 'ack', seed: 3 });
      const started = Date.now();
      const watched = await watch(serverB.port, match.id, 0, Number.POSITIVE_INFINITY, 15_000);
      const elapsed = Date.now() - started;
      expect(watched.end).toMatchObject({ type: 'end', result: { winner: expect.anything() } });
      expect(watched.events.length).toBeGreaterThan(10);
      expect(watched.events.map((event) => event.seq)).toEqual(watched.events.map((_, index) => index + 1));
      // 两边的轮询都是 60 秒：整局在几秒内播完只能是通知在起作用
      expect(elapsed).toBeLessThan(15_000);
      expect(eventsOnB.length).toBeGreaterThan(0);
      expect(acksOnA.length).toBeGreaterThan(0);
    } finally {
      await worker.stop();
      offA();
      offB();
    }
  });
});

describe('shared counters across instances', () => {
  it('shares the per-source creation limit: the second instance sees the first instance\'s matches', async () => {
    const playerIds = await seedPlayers(a, 9);
    for (let index = 0; index < 10; index += 1) {
      expect((await a.call<MatchSummaryDto>('POST', '/api/toc/matches', { body: { gameKey: 'debate', playerIds } })).status).toBe(201);
    }
    const onB = await b.call('POST', '/api/toc/matches', { body: { gameKey: 'debate', playerIds } });
    expect(onB).toMatchObject({ status: 429, body: { code: API_ERROR_CODES.tooManyRequests, message: expect.stringContaining('频繁') } });
  });

  it('shares the login lockout: failures on one instance lock the account on the other', async () => {
    for (let index = 0; index < 10; index += 1) {
      expect((await a.call('POST', '/api/admin/auth/login', { body: { username: ADMIN.username, password: `bad-${index}` } })).status).toBe(401);
    }
    const onB = await b.call('POST', '/api/admin/auth/login', { body: ADMIN });
    expect(onB).toMatchObject({ status: 429, body: { code: API_ERROR_CODES.tooManyRequests } });
  });
});

describe('mutual exclusion across instances', () => {
  it('synthesizes a given audio asset once even when both instances request it at the same time', async () => {
    let calls = 0;
    const provider: TtsProvider = {
      signature: 'slow:v1',
      synthesize: async (text) => {
        calls += 1;
        await slow(150);
        return { data: Buffer.from(`audio:${text}`), mime: 'audio/mpeg' };
      },
    };
    const ttsA = createTtsService({ azure: provider }, a.services.repositories.media);
    const ttsB = createTtsService({ azure: provider }, b.services.repositories.media);
    const voice: VoiceChoice = { provider: 'azure', voiceName: 'zh-CN-Test', language: 'zh-CN', style: '', rate: '', pitch: '' };
    const [fromA, fromB] = await Promise.all([ttsA.audioFor('同一句话', voice), ttsB.audioFor('同一句话', voice)]);
    expect(fromA).toEqual(fromB);
    expect(fromA?.url).toMatch(/^\/api\/media\/[0-9a-f]{40}$/);
    expect(calls).toBe(1);
    expect(await a.services.repositories.media.exists(fromA?.url.slice('/api/media/'.length) ?? '')).toBe(true);
  });

  it('lets only one instance sweep idle matches at a time', async () => {
    await a.db.transaction().execute(async (trx) => {
      await jobLock(trx, JOB_LOCKS.reaper);
      // A 正在清扫：B 拿不到锁就跳过
      expect(await b.services.reaper.sweep()).toBeNull();
    });
    expect(await b.services.reaper.sweep()).toEqual([]);
  });

  it('creates the bootstrap admin once when two instances start at the same time', async () => {
    await a.db.deleteFrom('adminUsers').execute();
    await Promise.all([a.services.auth.bootstrap(), b.services.auth.bootstrap()]);
    expect(await a.services.repositories.auth.count()).toBe(1);
    // 再跑一遍也不会多建
    await b.services.auth.bootstrap();
    expect(await b.services.repositories.auth.count()).toBe(1);
  });
});
