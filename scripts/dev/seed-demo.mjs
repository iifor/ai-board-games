// 本地演示数据：占位模型供应商、模型、浏览器朗读音色与 12 名 AI 玩家；加 --matches 再创建两局脚本化调试局。
// 用法：ADMIN_USERNAME=admin ADMIN_PASSWORD=<当前密码> node scripts/dev/seed-demo.mjs [--matches]
// 只调用后台公开的 REST 接口，不直接访问数据库；首次登录需先在后台修改初始密码。

const API = process.env.API_ORIGIN ?? 'http://127.0.0.1:3100';
const { ADMIN_USERNAME: username, ADMIN_PASSWORD: password } = process.env;
if (!username || !password) {
  console.error('请设置 ADMIN_USERNAME 与 ADMIN_PASSWORD（当前有效的管理员密码）');
  process.exit(1);
}

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

const NAMES = ['林知远', '苏晚晴', '顾北辰', '沈清欢', '陆子衿', '江一舟', '叶听雨', '程墨白', '许南星', '温如玉', '秦朗', '白露'];
const PERSONAS = ['逻辑严密的分析派', '温和但犀利', '喜欢抛出大胆假设', '谨慎稳重', '语速快、爱反驳', '冷静的观察者',
  '擅长讲故事', '数据控', '直觉敏锐', '善于总结', '爱挑战权威', '慢热型选手'];

const login = await call('POST', '/api/admin/auth/login', { username, password });
if (login.mustChangePassword) {
  console.error('该账号还需修改初始密码，请先登录后台（http://localhost:5174）修改后再运行');
  process.exit(1);
}
const token = login.token;
const provider = (await call('GET', '/api/admin/providers', undefined, token))[0]
  ?? await call('POST', '/api/admin/providers', { name: '占位供应商（请替换为真实接口）', baseUrl: 'https://example.invalid/v1', apiKey: 'sk-placeholder' }, token);
const model = (await call('GET', '/api/admin/models', undefined, token))[0]
  ?? await call('POST', '/api/admin/models', { providerId: provider.id, name: '占位模型', model: 'placeholder' }, token);
const voice = (await call('GET', '/api/admin/voices', undefined, token))[0]
  ?? await call('POST', '/api/admin/voices', { name: '浏览器朗读', provider: 'browser', voiceName: 'zh-CN' }, token);
const existing = await call('GET', '/api/admin/players', undefined, token);
for (let index = existing.length; index < NAMES.length; index += 1) {
  await call('POST', '/api/admin/players', { name: NAMES[index], persona: PERSONAS[index], modelId: model.id, voiceId: voice.id }, token);
}
const players = (await call('GET', '/api/admin/players', undefined, token)).map((player) => player.id);
console.log(`玩家共 ${players.length} 名`);

if (process.argv.includes('--matches')) {
  const debate = await call('POST', '/api/admin/matches', { gameKey: 'debate', playerIds: players.slice(0, 10), scripted: true, pacing: 'ack' }, token);
  const werewolf = await call('POST', '/api/admin/matches', { gameKey: 'werewolf', playerIds: players.slice(0, 12), scripted: true, pacing: 'ack' }, token);
  console.log(`辩论赛：http://localhost:5173/matches/${debate.id}`);
  console.log(`狼人杀：http://localhost:5173/matches/${werewolf.id}`);
}
