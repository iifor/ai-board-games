import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from '../../../packages/server/src/config/env';
import { createAzureTts } from '../../../packages/server/src/modules/tts/azure';
import { createAzureVoiceCatalog } from '../../../packages/server/src/modules/voices/azureCatalog';

const config = loadConfig().tts.azure;
if (!config) throw Error('Azure 未配置');
const provider = createAzureTts(config, createAzureVoiceCatalog(config));
const text = '等等。[短停][放慢]先校准一个概念。[恢复语速][抬高音调]你刚才的说法，和现在完全不同。[恢复]请解释清楚。';
for (const [name, voiceName] of [
  ['Neural-控制标签试听', 'zh-CN-XiaoxiaoNeural'],
  ['HDFlash-控制标签试听', 'zh-CN-Yunxi:DragonHDFlashLatestNeural'],
]) {
  const voice = { voiceName: voiceName!, language: 'zh-CN', style: '', rate: '0%', pitch: '0%' };
  const prepared = await provider.prepare!(text, voice);
  if (/短停|放慢|恢复|抬高/.test(prepared.text)) throw Error('控制标签未移除');
  const audio = await provider.synthesize(prepared.text, prepared.voice);
  const path = resolve('artifacts/azure-controls-20261114', name + '.mp3');
  await writeFile(path, audio.data);
  console.log(JSON.stringify({ voiceName, controls: prepared.voice.controls, segments: prepared.voice.segments, bytes: audio.data.length }));
}
