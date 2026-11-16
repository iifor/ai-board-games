import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClaimedTask } from '../src/modules/ai-worker/repository';
import { cleanSpeechOutput, createSpeechDelivery } from '../src/modules/ai-worker/speechDelivery';
import { createTestApp } from './support/testApp';
import { answerFor, runUntilSettled, seedPlayers } from './support/fixtures';
import type { LlmClient, LlmRequest } from '../src/modules/llm';
import { logger } from '../src/utils/logger';

const task: ClaimedTask = {
  matchId: 'm_fixture', requestId: 'r_1', seat: 1, attempts: 1,
  request: { id: 'r_1', seat: 1, phaseId: 'speech', action: 'speak', attempt: 1, legalTargets: null, outputSchema: {},
    prompt: { platform: '规则', rules: '玩法', identity: '人设', history: '历史', instruction: '请发言', output: '输出 JSON' } },
};
const baseVoice = { provider: 'azure', voiceName: 'zh-CN-XiaoxiaoNeural', language: 'zh-CN', style: '', rate: '0%', pitch: '0%' };
afterEach(() => vi.restoreAllMocks());

describe('voice-specific player tags', () => {
  it('adds the current voice list, including only measured controls', async () => {
    const catalog = async () => [{ voiceName: baseVoice.voiceName, styles: ['calm', 'chat'] }];
    const standard = await createSpeechDelivery({ matches: { seatVoice: async () => baseVoice }, catalog, region: 'eastasia' })(task);
    expect(standard.prompt.identity).toContain('[平静][聊天]');
    expect(standard.prompt.identity).toContain('[抬高音调]');
    expect(standard.prompt.identity).not.toContain('[愤怒]');
    const hd = { ...baseVoice, voiceName: 'zh-CN-Yunxi:DragonHDFlashLatestNeural' };
    const delivery = await createSpeechDelivery({ matches: { seatVoice: async () => hd }, catalog: async () => [{ voiceName: hd.voiceName, styles: ['angry'] }], region: 'eastasia' })(task);
    expect(delivery.prompt.identity).toContain('[放慢]');
    expect(delivery.prompt.identity).toContain('[愤怒]');
    expect(delivery.prompt.identity).not.toContain('[抬高音调]');
    expect(delivery.prompt.identity).not.toContain('[平静]');
  });

  it('cleans unsupported registered directions without deleting seat references, game terms or normal wide brackets', () => {
    expect(cleanSpeechOutput({ speech: '[冷静][短停][抬高音调]请听[3号]关于【投票】的解释。', declare: null }, 'speak', ['平静', '短停'])).toEqual({
      speech: '[平静][短停]请听[3号]关于【投票】的解释。', declare: null,
    });
    // 未登记的方括号内容是正文：狼人杀术语删掉会改变发言含义
    expect(cleanSpeechOutput({ speech: '我验了3号[查杀]，5号是[金水]。' }, 'speak', [])).toEqual({ speech: '我验了3号[查杀]，5号是[金水]。' });
    expect(cleanSpeechOutput({ comment: '[愤怒]论据充分' }, 'judge', [])).toEqual({ comment: '论据充分' });
  });

  it('avoids catalog work for actions, and retains measured controls during a catalog outage', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const catalog = vi.fn().mockRejectedValue(new Error('offline'));
    const matches = { seatVoice: vi.fn(async () => baseVoice) };
    const service = createSpeechDelivery({ matches, catalog, region: 'eastasia' });
    const action = { ...task, request: { ...task.request, action: 'vote' as const } };
    expect((await service(action)).prompt).toEqual(task.request.prompt);
    expect(matches.seatVoice).not.toHaveBeenCalled();
    expect((await service(task)).prompt.identity).toContain('[放慢]');
    expect(catalog).toHaveBeenCalledOnce();
  });

  it('does not advertise unmeasured controls for a new region or voice', async () => {
    const delivery = await createSpeechDelivery({ matches: { seatVoice: async () => baseVoice }, catalog: async () => [], region: 'unmeasured-region' })(task);
    expect(delivery.prompt.identity).toContain('[自然]');
    expect(delivery.prompt.identity).not.toContain('[放慢]');
  });
});

describe('worker delivery integration', () => {
  it('sends the per-seat list to the LLM and stores cleaned output and the actual prompt in Trace', async () => {
    const calls: LlmRequest[] = [];
    const voiceName = 'zh-CN-Yunxi:DragonHDFlashLatestNeural';
    const llm: LlmClient = { complete: async request => {
      calls.push(request);
      const answer = JSON.parse(answerFor(request)) as Record<string, unknown>;
      return { content: JSON.stringify({ ...answer, speech: '[短停][放慢][抬高音调][愤怒]这两句话需要解释。', comment: '[抬高音调]论证充分。' }), usage: null };
    } };
    const app = await createTestApp({ tts: { azure: { key: 'fixture', region: 'eastasia' }, mimo: null } }, {
      llm, azureVoiceCatalog: async () => [{ voiceName, styles: ['chat'] }],
    });
    try {
      const ids = await seedPlayers(app, 9);
      const player = await app.services.players.get(ids[0]!);
      const savedVoice = await app.services.voices.get(player.voiceId!);
      await app.services.voices.update(savedVoice.id, { ...savedVoice, voiceName });
      const match = await app.services.matches.createDebug({ gameKey: 'debate', playerIds: ids, pacing: 'free', seed: 31 });
      app.services.worker.start();
      await runUntilSettled(app, match.id);
      expect((await app.services.repositories.matches.find(match.id))?.status).toBe('completed');
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]?.messages[0]?.content).toContain('[放慢]');
      expect(calls[0]?.messages[0]?.content).not.toContain('[抬高音调]');
      const rows = await app.db.selectFrom('aiCalls').select(['prompt', 'output', 'rawResponse']).where('matchId', '=', match.id).execute();
      expect(JSON.stringify(rows[0]?.prompt)).toContain('本次朗读标记约束');
      const snapshot = await app.services.repositories.matches.snapshot(match.id);
      const spoken = snapshot?.log.flatMap(entry => {
        if (entry.kind === 'speech') return [entry.text];
        if (entry.kind === 'judgement') return [entry.comment];
        return [];
      });
      expect(JSON.stringify(spoken)).not.toMatch(/抬高音调|愤怒/);
      expect(rows[0]?.rawResponse).toContain('[抬高音调]');
    } finally { await app.cleanup(); }
  });
});
