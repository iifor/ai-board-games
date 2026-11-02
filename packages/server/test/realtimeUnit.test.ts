import { describe, expect, it } from 'vitest';
import type { StageEvent } from '@battle/shared';
import { createAudioResolver, createMatchStream, frameBytes, MAX_CLIENT_FRAME_BYTES, type StreamMatch } from '../src/modules/realtime';
import { createEventBus } from '../src/utils/eventBus';
import { assetId, createTtsService, type VoiceChoice } from '../src/modules/tts';
import { createMimoTts } from '../src/modules/tts/mimo';
import type { MediaRepository } from '../src/modules/tts/repository';
import { fakeTts } from './support/fixtures';

describe('realtime stream', () => {
  const view: StageEvent['view'] = { gameKey: 'debate', title: 'AI 辩论赛', round: 1, phase: null, status: 'running', seats: [], extra: {}, result: null };
  const narration = (seq: number): StageEvent => ({ kind: 'narration', text: `第 ${seq} 段`, seq, round: 1, phaseId: null, channel: 'public', view });

  it('does not lose a wake-up that arrives while it is already pumping', async () => {
    const bus = createEventBus();
    const events: StageEvent[] = [];
    const match: StreamMatch = { status: 'waiting_ai', scripted: true, result: null, error: null };
    let release: (() => void) | null = null;
    const sent: string[] = [];
    const stream = createMatchStream('m_1', { send: (data) => sent.push(data), close: () => {} }, {
      bus,
      audio: { audioFor: async () => null },
      matches: {
        find: async () => match,
        // 第一次查询在提交之前就定下了结果，然后挂起：模拟 worker 在这期间提交了新事件并发出通知
        nextEvent: async (_id, after) => {
          const found = events.find((event) => event.seq > after);
          if (release === null) await new Promise<void>((resolve) => { release = resolve; });
          return found;
        },
        markAcked: async () => {},
      },
    }, { pollMs: 60_000 });
    stream.hello(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    events.push(narration(1));
    bus.emit('match:events', { matchId: 'm_1', lastSeq: 1 });
    const unblock = release as (() => void) | null;
    expect(unblock).not.toBeNull();
    unblock?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // 旧实现：第一轮只发出过期的 status，通知被丢掉，观众一直挂着；现在会再查一次并推出事件
    const kinds = sent.map((data) => (JSON.parse(data) as { type: string }).type);
    expect(kinds).toEqual(['status', 'event']);
    stream.dispose();
  });

  it('delivers an event committed without any bus notification through the fallback poll', async () => {
    // 多实例部署：事件由另一个实例的 worker 提交，本进程的总线不会收到通知
    const events: StageEvent[] = [];
    const sent: string[] = [];
    let queries = 0;
    const stream = createMatchStream('m_2', { send: (data) => sent.push(data), close: () => {} }, {
      bus: createEventBus(),
      audio: { audioFor: async () => null },
      matches: {
        find: async (): Promise<StreamMatch> => ({ status: 'waiting_ai', scripted: true, result: null, error: null }),
        nextEvent: async (_id, after) => {
          queries += 1;
          return events.find((event) => event.seq > after);
        },
        markAcked: async () => {},
      },
    }, { pollMs: 10 });
    stream.hello(0);
    await new Promise((resolve) => setTimeout(resolve, 25));
    events.push(narration(1));
    await new Promise((resolve) => setTimeout(resolve, 40));
    const messages = sent.map((data) => JSON.parse(data) as { type: string; status?: string; event?: StageEvent });
    // 等待期间状态没变，兜底重查不会反复发 status；查到事件后推送，然后等 ack，不再轮询
    expect(messages.map((message) => message.type)).toEqual(['status', 'event']);
    expect(messages[1]?.event?.seq).toBe(1);
    const queriesAfterEvent = queries;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(queries).toBe(queriesAfterEvent);
    stream.dispose();
  });
});

describe('realtime stream reconnect', () => {
  const live: StreamMatch = { status: 'waiting_ai', scripted: true, result: null, error: null };

  function streamWith(find: () => Promise<StreamMatch | undefined>) {
    const bus = createEventBus();
    const acked: number[] = [];
    const notified: number[] = [];
    bus.on('match:acked', (payload) => notified.push(payload.seq));
    const sent: string[] = [];
    const stream = createMatchStream('m_3', { send: (data) => sent.push(data), close: () => {} }, {
      bus,
      audio: { audioFor: async () => null },
      matches: { find, nextEvent: async () => undefined, markAcked: async (_id, seq) => { acked.push(seq); } },
    }, { pollMs: 60_000 });
    return { stream, acked, notified, sent };
  }

  it('treats the afterSeq of a reconnecting viewer as an acknowledgement of that progress', async () => {
    // 断线前最后一次 ack 可能没送到：重连带的 afterSeq 就是观众播完的进度，补记后后台"观众确认"不会少一个
    const { stream, acked, notified } = streamWith(async () => live);
    stream.hello(7);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(acked).toEqual([7]);
    expect(notified).toEqual([7]);
    stream.dispose();
  });

  it('acknowledges nothing for a viewer starting from the beginning or for a match it cannot see', async () => {
    const fresh = streamWith(async () => live);
    fresh.stream.hello(0);
    const hidden = streamWith(async () => undefined);
    hidden.stream.hello(7);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fresh.acked).toEqual([]);
    expect(hidden.acked).toEqual([]);
    expect(hidden.sent.map((data) => JSON.parse(data) as unknown)).toEqual([{ type: 'error', message: '对局不存在' }]);
    fresh.stream.dispose();
    hidden.stream.dispose();
  });
});

describe('audio resolver', () => {
  const view: StageEvent['view'] = { gameKey: 'werewolf', title: '狼人杀', round: 1, phase: null, status: 'running', seats: [], extra: {}, result: null };
  const meta = { round: 1, phaseId: null, channel: 'public' } as const;
  const voice = { provider: 'azure', language: 'zh-CN', style: '', rate: '', pitch: '' } as const;

  it('reads what the shared speech rule says: judgement with its verdict by the seat voice, actions by the host voice', async () => {
    const synthesized: { text: string; voice: string | null }[] = [];
    const resolver = createAudioResolver({
      voices: { findEnabledByName: async (name) => ({ ...voice, voiceName: name }) },
      matches: { seatVoice: async (_id, seat) => ({ ...voice, voiceName: `seat-${seat}` }) },
      tts: {
        audioFor: async (text, chosen) => {
          synthesized.push({ text, voice: chosen?.voiceName ?? null });
          return { url: '/api/media/x', mime: 'audio/mpeg' };
        },
      },
    });
    const judgement: StageEvent = { kind: 'judgement', seat: 3, verdict: 'pro', verdictLabel: '正方胜', comment: '论证清晰。', seq: 1, ...meta, view };
    const action: StageEvent = { kind: 'action', seat: 2, action: 'shoot', targets: [5], text: '2 号开枪带走了 5 号', seq: 2, ...meta, view };
    const title: StageEvent = { kind: 'phase_started', title: '天亮了', seq: 3, ...meta, view };
    expect(await resolver.audioFor('m_1', judgement, false)).toEqual({ url: '/api/media/x', mime: 'audio/mpeg' });
    await resolver.audioFor('m_1', action, false);
    expect(await resolver.audioFor('m_1', title, false)).toBeNull();
    // 脚本化对局不合成
    expect(await resolver.audioFor('m_2', judgement, true)).toBeNull();
    expect(synthesized).toEqual([
      { text: '正方胜。论证清晰。', voice: 'seat-3' },
      { text: '2 号开枪带走了 5 号', voice: '主持人' },
    ]);
  });
});

describe('tts cache key', () => {
  const voice: VoiceChoice = { provider: 'mimo', voiceName: 'xiaoai', language: 'zh-CN', style: '温和', rate: '', pitch: '' };

  it('includes the synthesizer signature so two models with the same voice do not share audio', () => {
    const a = assetId({ signature: 'mimo:model-a:mp3' }, voice, '你好');
    expect(assetId({ signature: 'mimo:model-a:mp3' }, voice, '你好')).toBe(a);
    expect(assetId({ signature: 'mimo:model-b:mp3' }, voice, '你好')).not.toBe(a);
    const mimo = { apiKey: 'k', baseUrl: 'https://tts.example.com/v1' };
    expect(createMimoTts({ ...mimo, model: 'mimo-v2.5-tts' }).signature).not.toBe(createMimoTts({ ...mimo, model: 'mimo-v3-tts' }).signature);
  });

  it('synthesizes again for a different model instead of serving the other model\'s cached audio', async () => {
    const stored = new Map<string, { id: string; provider: string; voiceName: string; mime: string; data: Buffer }>();
    const repository: MediaRepository = {
      find: async (id) => {
        const row = stored.get(id);
        return row ? { ...row, createdAt: new Date() } : undefined;
      },
      exists: async (id) => stored.has(id),
      locked: (id, work) => work({
        exists: async () => stored.has(id),
        insert: async (values) => {
          stored.set(id, { id, ...values });
        },
      }),
    };
    const first = fakeTts('mimo:model-a:mp3');
    const second = fakeTts('mimo:model-b:mp3');
    const a = await createTtsService({ mimo: first }, repository).synthesize('你好', voice);
    const b = await createTtsService({ mimo: second }, repository).synthesize('你好', voice);
    expect(a.url).not.toBe(b.url);
    expect(second.texts).toEqual(['你好']);
    // 同一合成器、同样的文本仍命中缓存
    expect((await createTtsService({ mimo: first }, repository).synthesize('你好', voice)).url).toBe(a.url);
    expect(first.texts).toEqual(['你好']);
  });
});

describe('realtime protocol', () => {
  it('measures client frames in bytes, not characters', () => {
    expect(frameBytes('abc')).toBe(3);
    expect(frameBytes('中文')).toBe(6);
    expect(frameBytes(new ArrayBuffer(8))).toBe(8);
    expect(frameBytes('x'.repeat(MAX_CLIENT_FRAME_BYTES))).toBe(MAX_CLIENT_FRAME_BYTES);
  });
});
