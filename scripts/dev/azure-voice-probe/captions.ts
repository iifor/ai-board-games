import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from '../../../packages/server/src/config/env';
import { createDatabase } from '../../../packages/server/src/db/database';
import { createAzureSynthesis, type AzureWordBoundary } from '../../../packages/server/src/modules/tts/azureTransport';
import { azureCaptionCues } from '../../../packages/server/src/modules/tts/azureCaptions';
import { prepareAzureSpeech } from '../../../packages/server/src/modules/tts/azureSpeech';
import { azureControlSupport } from '../../../packages/server/src/modules/tts/azureControlCapabilities';
import { buildAzureSsml } from '../../../packages/server/src/modules/tts/azureSsml';
import { createAzureVoiceCatalog } from '../../../packages/server/src/modules/voices/azureCatalog';

const config = loadConfig();
if (!config.tts.azure) throw Error('Azure 未配置');
const azure = config.tts.azure;
const db = createDatabase(config.database);
const rows = await db.selectFrom('players').innerJoin('voices', 'voices.id', 'players.voiceId')
  .select(['voices.voiceName', 'voices.style', 'voices.rate', 'voices.pitch', 'voices.language', 'players.name as player'])
  .where('players.enabled', '=', true).where('voices.enabled', '=', true).where('voices.provider', '=', 'azure').execute();
await db.destroy();
const voices = [...new Map(rows.map(row => [row.voiceName, row])).values()];
const synthesize = createAzureSynthesis(azure);
const catalog = createAzureVoiceCatalog(azure);
const directory = resolve('artifacts/azure-captions-20261114');
await mkdir(directory, { recursive: true });
const results: object[] = [];
for (const [index, voice] of voices.entries()) {
  const text = '先核对刚才的发言。[长停][放慢]我们再讨论今天的投票。';
  try {
    const prepared = await prepareAzureSpeech(text, voice, catalog, azureControlSupport(voice.voiceName, azure.region));
    let words: readonly AzureWordBoundary[];
    if (process.argv.includes('--existing')) {
      const saved = JSON.parse(await readFile(resolve(directory, `${index}.json`), 'utf8')) as { voiceName: string; words: AzureWordBoundary[] };
      if (saved.voiceName !== voice.voiceName) throw Error('已有样本音色与当前列表不一致');
      words = saved.words;
    } else {
      const result = await synthesize(buildAzureSsml(prepared.voice, prepared.text));
      await writeFile(resolve(directory, `${index}.mp3`), result.data);
      words = result.words;
    }
    const captions = azureCaptionCues(prepared.text, words);
    if (captions?.length !== 2) throw Error('字幕未完整对齐');
    await writeFile(resolve(directory, `${index}.json`), JSON.stringify({ player: voice.player, voiceName: voice.voiceName, text: prepared.text, words, captions }, null, 2));
    results.push({ voiceName: voice.voiceName, wordCount: words.length, captions });
    console.log(JSON.stringify({ voiceName: voice.voiceName, wordCount: words.length, captions }));
  } catch (error) {
    results.push({ voiceName: voice.voiceName, error: error instanceof Error ? error.message : '合成失败' });
    console.log(`${voice.voiceName} FAILED`);
  }
}
await writeFile(resolve(directory, 'summary.json'), JSON.stringify({ region: azure.region, results }, null, 2));
