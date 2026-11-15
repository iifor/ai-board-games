import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAzureSynthesis } from '../src/modules/tts/azureTransport';
import { TTS_TIMEOUT_MS } from '../src/modules/tts/types';

interface Boundary { text: string; audioOffset: number; duration: number; boundaryType: string }
interface Result { reason: string; audioData: ArrayBuffer }
const fixture = vi.hoisted(() => ({
  wordBoundary: (_sender: unknown, _event: Boundary) => {},
  speakSsmlAsync: vi.fn<(text: string, done: (result: Result) => void, fail: (message: string) => void) => void>(),
  close: vi.fn(),
}));
vi.mock('microsoft-cognitiveservices-speech-sdk', () => ({
  SpeechConfig: { fromSubscription: () => ({ setProperty: vi.fn() }) },
  SpeechSynthesizer: vi.fn(function () { return fixture; }),
  PropertyId: { SpeechServiceResponse_RequestWordBoundary: 'word', SpeechServiceResponse_RequestSentenceBoundary: 'sentence' },
  SpeechSynthesisOutputFormat: { Audio24Khz48KBitRateMonoMp3: 'mp3' },
  SpeechSynthesisBoundaryType: { Sentence: 'SentenceBoundary' },
  ResultReason: { SynthesizingAudioCompleted: 'complete' },
}));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('Azure SDK transport', () => {
  it('takes audio and word timings from the same synthesis and converts 100ns ticks to ms', async () => {
    fixture.speakSsmlAsync.mockImplementation((_ssml, done) => {
      fixture.wordBoundary(null, { text: '你好。', audioOffset: 500_000, duration: 3_000_000, boundaryType: 'SentenceBoundary' });
      fixture.wordBoundary(null, { text: '你好', audioOffset: 500_000, duration: 3_000_000, boundaryType: 'WordBoundary' });
      fixture.wordBoundary(null, { text: '。', audioOffset: 3_500_000, duration: 0, boundaryType: 'PunctuationBoundary' });
      done({ reason: 'complete', audioData: new Uint8Array([1, 2, 3]).buffer });
    });
    const result = await createAzureSynthesis({ key: 'test', region: 'eastasia' })('<speak>你好。</speak>');
    expect(result).toEqual({ data: Buffer.from([1, 2, 3]), mime: 'audio/mpeg', words: [
      { text: '你好', startMs: 50, endMs: 350 }, { text: '。', startMs: 350, endMs: 350 },
    ] });
    expect(fixture.close).toHaveBeenCalledOnce();
  });

  it('closes a failed SDK connection and exposes a safe error', async () => {
    fixture.speakSsmlAsync.mockImplementation((_ssml, _done, fail) => fail('secret upstream details'));
    await expect(createAzureSynthesis({ key: 'test', region: 'eastasia' })('<speak/>')).rejects.toThrow('无法连接 Azure 语音合成服务');
    expect(fixture.close).toHaveBeenCalledOnce();
  });

  it('times out and closes once even if a completion callback arrives late', async () => {
    vi.useFakeTimers();
    fixture.speakSsmlAsync.mockImplementation(() => {});
    const result = createAzureSynthesis({ key: 'test', region: 'eastasia' })('<speak/>');
    const rejection = expect(result).rejects.toThrow('Azure 语音合成超时');
    await vi.advanceTimersByTimeAsync(TTS_TIMEOUT_MS);
    await rejection;
    fixture.speakSsmlAsync.mock.calls[0]?.[1]({ reason: 'complete', audioData: new ArrayBuffer(0) });
    expect(fixture.close).toHaveBeenCalledOnce();
  });
});
