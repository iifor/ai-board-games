import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from '../../../packages/server/src/config/env';
import { createDatabase } from '../../../packages/server/src/db/database';
import { createAzureVoiceCatalog } from '../../../packages/server/src/modules/voices/azureCatalog';
import { escapeXml } from '../../../packages/server/src/modules/tts/azureSsml';

const output = resolve(process.argv[2] ?? 'artifacts/azure-controls-20261114');
const config = loadConfig();
if (!config.tts.azure) throw Error('Azure 语音未配置');
const azure = config.tts.azure;
const db = createDatabase(config.database);
const players = await db.selectFrom('players').innerJoin('voices', 'voices.id', 'players.voiceId')
  .select(['players.name as player', 'voices.voiceName', 'voices.style'])
  .where('players.enabled', '=', true).where('voices.enabled', '=', true).where('voices.provider', '=', 'azure').execute();
const hosts = await db.selectFrom('voices').select(['name as player', 'voiceName', 'style'])
  .where('name', '=', '主持人').where('enabled', '=', true).where('provider', '=', 'azure').execute();
await db.destroy();
const catalog = await createAzureVoiceCatalog(azure)();
const voices = [...new Map([...players, ...hosts].map(row => [row.voiceName, row])).values()];
const repeated = process.argv.includes('--repeat-hd');
const variants = repeated ? [
  { name: 'baseline-3', rate: '0%', pitch: '0%' }, { name: 'baseline-4', rate: '0%', pitch: '0%' },
  { name: 'slow-2', rate: '-30%', pitch: '0%' }, { name: 'slow-3', rate: '-30%', pitch: '0%' },
  { name: 'fast-2', rate: '+30%', pitch: '0%' }, { name: 'fast-3', rate: '+30%', pitch: '0%' },
  { name: 'low-2', rate: '0%', pitch: '-20%' }, { name: 'low-3', rate: '0%', pitch: '-20%' },
  { name: 'high-2', rate: '0%', pitch: '+20%' }, { name: 'high-3', rate: '0%', pitch: '+20%' },
] : [
  { name: 'baseline-1', rate: '0%', pitch: '0%' },
  { name: 'baseline-2', rate: '0%', pitch: '0%' },
  { name: 'pause', rate: '0%', pitch: '0%' },
  { name: 'slow', rate: '-30%', pitch: '0%' },
  { name: 'fast', rate: '+30%', pitch: '0%' },
  { name: 'low', rate: '0%', pitch: '-20%' },
  { name: 'high', rate: '0%', pitch: '+20%' },
];
await mkdir(output, { recursive: true });
const inventory = voices.map((voice, index) => ({ ...voice, index,
  styles: catalog.find(item => item.voiceName === voice.voiceName)?.styles ?? [] }));
await writeFile(resolve(output, 'inventory.json'), JSON.stringify({ region: azure.region, voices: inventory }, null, 2));
const results: object[] = [];
const queue = inventory.filter(voice => !repeated || voice.voiceName.includes(':Dragon')).flatMap(voice => variants.map(variant => ({ voice, variant })));

async function worker() {
  for (;;) {
    const job = queue.shift();
    if (!job) return;
    const { voice, variant } = job;
    const file = `${String(voice.index).padStart(2, '0')}-${variant.name}`;
    let inner = `先核对刚才的发言，${variant.name === 'pause' ? '<break time="1200ms"/>' : ''}我们再讨论今天的投票。`;
    inner = `<prosody rate="${variant.rate}" pitch="${variant.pitch}">${inner}</prosody>`;
    if (voice.style) inner = `<mstts:express-as style="${escapeXml(voice.style)}">${inner}</mstts:express-as>`;
    const parameters = voice.voiceName.includes(':Dragon') ? ' parameters="temperature=0.0"' : '';
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN"><voice name="${escapeXml(voice.voiceName)}"${parameters}>${inner}</voice></speak>`;
    await writeFile(resolve(output, file + '.ssml'), ssml);
    try {
      const response = await fetch(`https://${azure.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': azure.key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'raw-16khz-16bit-mono-pcm' },
        body: ssml, signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw Error(`HTTP ${response.status}`);
      }
      const audio = Buffer.from(await response.arrayBuffer());
      await writeFile(resolve(output, file + '.pcm'), audio);
      results.push({ voiceName: voice.voiceName, variant: variant.name, file, bytes: audio.length });
      console.log(`${voice.index + 1}/${voices.length} ${variant.name} ${audio.length} bytes`);
    } catch (error) {
      results.push({ voiceName: voice.voiceName, variant: variant.name, file, error: error instanceof Error ? error.message : '合成失败' });
      console.log(`${voice.index + 1}/${voices.length} ${variant.name} FAILED`);
    }
    await writeFile(resolve(output, repeated ? 'repeat-requests.json' : 'requests.json'), JSON.stringify(results, null, 2));
  }
}
await Promise.all([worker(), worker()]);
console.log(`Collected ${results.length} samples in ${output}`);
