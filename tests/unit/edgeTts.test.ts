import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAudioCacheKey,
  isEdgeVoice,
  isServerTtsVoice,
} from '../../packages/server/modules/tts/utils';

test('edge voice is prepared by the server and has an isolated cache key', () => {
  const voice = {
    enabled: true,
    provider: 'edge',
    voiceId: 'zh-CN-XiaoxiaoNeural',
    language: 'zh-CN',
    rate: '0%',
    pitch: '0Hz',
  };

  assert.equal(isEdgeVoice(voice), true);
  assert.equal(isServerTtsVoice(voice), true);
  assert.notEqual(
    buildAudioCacheKey(voice, '你好'),
    buildAudioCacheKey({ ...voice, rate: '+10%' }, '你好'),
  );
});
