import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { loadConfig } from '../../../packages/server/src/config/env';
import { createDatabase } from '../../../packages/server/src/db/database';
import { migrateToLatest } from '../../../packages/server/src/db/migrate';
import { createAzureTts } from '../../../packages/server/src/modules/tts/azure';
import { createAzureSynthesis } from '../../../packages/server/src/modules/tts/azureTransport';
import { createMediaRepository } from '../../../packages/server/src/modules/tts/repository';
import { createTtsService } from '../../../packages/server/src/modules/tts/service';

const config = loadConfig();
if (!config.tts.azure) throw Error('Azure 未配置');
const db = createDatabase(config.database);
try {
  const migrations = await migrateToLatest(db, config.database.schema);
  const voice = await db.selectFrom('voices').select(['voiceName', 'language', 'style', 'rate', 'pitch'])
    .where('provider', '=', 'azure').where('enabled', '=', true).where('voiceName', '=', 'zh-CN-XiaoxiaoNeural').executeTakeFirstOrThrow();
  let requests = 0;
  const synthesize = createAzureSynthesis(config.tts.azure);
  const provider = createAzureTts(config.tts.azure, undefined, ssml => { requests++; return synthesize(ssml); });
  const media = createMediaRepository(db);
  const text = '先核对刚才的发言。[长停][放慢]我们再讨论今天的投票。';
  const first = await createTtsService({ azure: provider }, media).synthesize(text, { provider: 'azure', ...voice });
  const cached = await createTtsService({ azure: provider }, media).synthesize(text, { provider: 'azure', ...voice });
  if (!isDeepStrictEqual(first, cached) || first.captions?.length !== 2) {
    console.log(JSON.stringify({ first, cached }));
    throw Error('缓存字幕验证失败');
  }
  const asset = await media.find(first.url.slice('/api/media/'.length));
  if (!asset?.data.length) throw Error('缓存音频缺失');
  const directory = resolve('artifacts/azure-captions-20261114');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'cached.mp3'), asset.data);
  const result = { migrations, voiceName: voice.voiceName, requests, sameReference: true, ...first };
  await writeFile(resolve(directory, 'cache.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await db.destroy();
}
