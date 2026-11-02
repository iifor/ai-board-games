// 迁移旧版配置：内置音色目录（Azure / Mimo / 浏览器）与旧 SQLite 里的 12 名 AI 玩家人设（scripts/dev/legacy/players.json）。
// 用法：ADMIN_USERNAME=admin ADMIN_PASSWORD=<当前密码> node scripts/dev/import-legacy.mjs [--voices] [--players]
// 不带参数时两者都导入。只调用后台 REST 接口，可重复执行：音色按（来源、音色名、风格）去重，玩家按名称去重。
// 玩家绑定到第一个启用的模型；没有模型时创建占位供应商与模型（之后在后台替换为真实接口）。

import { readFileSync } from 'node:fs';

const API = process.env.API_ORIGIN ?? 'http://127.0.0.1:3100';
const { ADMIN_USERNAME: username, ADMIN_PASSWORD: password } = process.env;
if (!username || !password) {
  console.error('请设置 ADMIN_USERNAME 与 ADMIN_PASSWORD（当前有效的管理员密码）');
  process.exit(1);
}
const flags = new Set(process.argv.slice(2));
const wantVoices = flags.size === 0 || flags.has('--voices');
const wantPlayers = flags.size === 0 || flags.has('--players');

async function call(method, path, body, token) {
  const response = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (payload.code !== 0) throw new Error(`${method} ${path} 失败：${payload.message}`);
  return payload.data;
}

const login = await call('POST', '/api/admin/auth/login', { username, password });
if (login.mustChangePassword) {
  console.error('该账号还需修改初始密码，请先登录后台（http://localhost:5174）修改后再运行');
  process.exit(1);
}
const token = login.token;

if (wantVoices) {
  const result = await call('POST', '/api/admin/voices/import-defaults', {}, token);
  console.log(`音色目录：新增 ${result.created} 个，跳过 ${result.skipped} 个已存在的`);
}

if (wantPlayers) {
  const models = await call('GET', '/api/admin/models', undefined, token);
  let model = models.find((item) => item.enabled) ?? models[0];
  if (!model) {
    const provider = await call('POST', '/api/admin/providers', { name: '占位供应商（请替换为真实接口）', baseUrl: 'https://example.invalid/v1', apiKey: 'sk-placeholder' }, token);
    model = await call('POST', '/api/admin/models', { providerId: provider.id, name: '占位模型', model: 'placeholder' }, token);
  }
  const existing = new Set((await call('GET', '/api/admin/players', undefined, token)).map((item) => item.name));
  const legacy = JSON.parse(readFileSync(new URL('./legacy/players.json', import.meta.url), 'utf8'));
  let created = 0;
  for (const player of legacy) {
    if (existing.has(player.name)) continue;
    await call('POST', '/api/admin/players', { name: player.name, persona: player.persona, modelId: model.id }, token);
    created += 1;
  }
  console.log(`旧玩家：新增 ${created} 名，跳过 ${legacy.length - created} 名已存在的（绑定模型「${model.name}」）`);
}
