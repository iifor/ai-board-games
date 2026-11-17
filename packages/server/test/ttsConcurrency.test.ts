import { describe, expect, it } from 'vitest';
import { createTtsService, type MediaRepository, type TtsProvider, type VoiceChoice } from '../src/modules/tts';
import { createSemaphore } from '../src/utils/semaphore';

const voice: VoiceChoice = { provider: 'mimo', voiceName: 'xiaoai', language: 'zh-CN', style: '', rate: '', pitch: '' };
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('semaphore', () => {
  it('runs at most max tasks at once, in arrival order, and frees the slot when a task fails', async () => {
    const slots = createSemaphore(2);
    const order: number[] = [];
    const gates: Array<() => void> = [];
    const tasks = [0, 1, 2, 3].map((index) => slots.run(async () => {
      order.push(index);
      await new Promise<void>((resolve) => gates.push(resolve));
      if (index === 0) throw new Error('boom');
      return index;
    }));
    await tick();
    expect(slots.stats()).toEqual({ running: 2, waiting: 2 });
    gates[0]?.();
    await expect(tasks[0]).rejects.toThrow('boom');
    await tick();
    expect(order).toEqual([0, 1, 2]);
    for (const open of gates.slice(1)) open();
    await tick();
    for (const open of gates.slice(3)) open();
    expect(await Promise.all(tasks.slice(1))).toEqual([1, 2, 3]);
    expect(slots.stats()).toEqual({ running: 0, waiting: 0 });
  });
});

describe('tts concurrency', () => {
  it('never holds more locked transactions than the synthesis cap', async () => {
    let open = 0;
    let peak = 0;
    const stored = new Set<string>();
    const repository: MediaRepository = {
      find: async () => undefined,
      reference: async () => undefined,
      exists: async (id) => stored.has(id),
      // 每个 locked 调用代表一个占着连接的持锁事务
      locked: async (id, work) => {
        open += 1;
        peak = Math.max(peak, open);
        try {
          return await work({ reference: async () => undefined, insert: async () => { stored.add(id); } });
        } finally {
          open -= 1;
        }
      },
    };
    const provider: TtsProvider = {
      signature: 'slow:v1',
      synthesize: async (text) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { data: Buffer.from(text), mime: 'audio/mpeg' };
      },
    };
    const tts = createTtsService({ mimo: provider }, repository, { maxConcurrent: 2 });
    const refs = await Promise.all(Array.from({ length: 8 }, (_, i) => tts.synthesize(`第 ${i} 句`, voice)));
    expect(refs).toHaveLength(8);
    expect(stored.size).toBe(8);
    expect(peak).toBe(2);
  });
});
