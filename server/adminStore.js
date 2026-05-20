const crypto = require('crypto');
const { getDb, getDatabasePath } = require('./db');
const { BUILTIN_TEMPLATE, getMarkdownSkinTemplates } = require('./mistTemplate');
const { deleteGeneratedAudioByUrl } = require('./uploadStore');

const DEFAULT_PLAYERS = [
  { id: 1, nickname: '豆包', avatar: '/avatars/豆包.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '元气少女，情绪外放，冲动感性，开心就笑难过就哭，完全凭直觉行事，常与理性派唱反调。', sex: '女' },
  { id: 2, nickname: 'Grok', avatar: '/avatars/Grok.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '毒舌尖锐，专抓逻辑漏洞，用黑色幽默解构一切，说话带刺但往往一针见血，敢怼天怼地。', sex: '男' },
  { id: 3, nickname: '文心一言', avatar: '/avatars/文心一言.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '古风小生，儒雅温和，但思想保守，动辄“古人云”，对新鲜事物常持怀疑态度。', sex: '男' },
  { id: 4, nickname: 'Gemini', avatar: '/avatars/Gemini.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '优雅科学家，理性至上，信奉数据和逻辑，认为情感是决策的噪声，常冷冰冰分析问题。', sex: '男' },
  { id: 5, nickname: 'Kimi', avatar: '/avatars/Kimi.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '温暖喜剧人，用段子讲道理，表面嘻嘻哈哈实则洞察人心，擅长用幽默化解尴尬，底色温柔。', sex: '男' },
  { id: 6, nickname: 'DeepSeek', avatar: '/avatars/DeepSeek.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '逻辑缜密如锁链，冷静破局的天才少年，但极度理性以至于显得冷漠，不擅长共情。', sex: '男' },
  { id: 7, nickname: '千问', avatar: '/avatars/千问.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '温润倾听者，善解人意，但有时过于共情而失去立场，容易被人带跑偏，像个“情绪海绵”。', sex: '女' },
  { id: 8, nickname: '元宝', avatar: '/avatars/元宝.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '活泼治愈系，软萌元气，但偶尔犯二，说话不过脑子，常闹笑话，却让人讨厌不起来。', sex: '女' },
  { id: 9, nickname: '讯飞星火', avatar: '/avatars/讯飞星火.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '思维极度发散，天马行空，联想力爆棚，常常从一个话题跳到另一个完全不相关的话题，脑回路清奇。', sex: '女' },
  { id: 10, nickname: '智谱清言', avatar: '/avatars/智谱清言.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '沉稳理性的思辨者，但喜欢抬杠式辩论，无论你说什么都能找到反驳角度，理性但好斗。', sex: '女' },
  { id: 11, nickname: 'ChatGPT', avatar: '/avatars/ChatGPT.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '圆滑世故的全能型，擅长适配任何场景，见人说人话见鬼说鬼话，有时显得油滑，不够真诚。', sex: '男' },
  { id: 12, nickname: 'Claude', avatar: '/avatars/Claude.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '细节控完美主义，对任何细节都追求极致，吹毛求疵，常因小问题纠结半天，可靠但有点烦人。', sex: '女' }
];

const DEFAULT_MODELS = [
  { provider: 'deepseek', name: 'deepseek-v4-pro', baseUrl: 'https://api.deepseek.com', apiFormat: 'openai-compatible', enabled: true },
  { provider: 'openai', name: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', apiFormat: 'openai-compatible', enabled: true },
  { provider: 'qwen', name: 'qwen-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiFormat: 'openai-compatible', enabled: true }
];

const DEFAULT_VOICE_PACKAGES = [
  { name: '默认中文女声', provider: 'browser', voiceId: 'zh-CN-female', language: 'zh-CN', description: '浏览器中文女声优先匹配', enabled: true },
  { name: '默认中文男声', provider: 'browser', voiceId: 'zh-CN-male', language: 'zh-CN', description: '浏览器中文男声优先匹配', enabled: true }
];

const DEFAULT_AZURE_VOICE_PACKAGES = [
  ['yue-CN', 'yue-CN-YunSongNeural', '男', '粤语（简体）男声'],
  ['zh-CN', 'zh-CN-Xiaoxiao:DragonHDFlashLatestNeural', '女', '普通话 HD Flash 女声', 'cheerful'],
  ['zh-CN', 'zh-CN-Xiaoxiao2:DragonHDFlashLatestNeural', '女', '普通话 HD Flash 女声 2', 'cheerful'],
  ['zh-CN', 'zh-CN-Xiaochen:DragonHDLatestNeural', '女', '普通话 HD 女声'],
  ['zh-CN', 'zh-CN-Yunxiao:DragonHDFlashLatestNeural', '男', '普通话 HD Flash 男声'],
  ['zh-CN', 'zh-CN-Yunyi:DragonHDFlashLatestNeural', '男', '普通话 HD Flash 男声', 'game-narrator'],
  ['zh-CN', 'zh-CN-Yunfan:DragonHDLatestNeural', '男', '普通话 HD 男声'],
  ['zh-CN', 'zh-CN-Xiaoyue:DragonHDOmniLatestNeural', '女', '普通话 HD Omni 女声'],
  ['zh-CN', 'zh-CN-Yunqi:DragonHDOmniLatestNeural', '男', '普通话 HD Omni 男声'],
  ['zh-CN', 'zh-CN-XiaoxiaoNeural', '女', '普通话女声', 'cheerful'],
  ['zh-CN', 'zh-CN-YunxiNeural', '男', '普通话男声', 'chat'],
  ['zh-CN', 'zh-CN-YunjianNeural', '男', '普通话男声', 'narration-relaxed'],
  ['zh-CN', 'zh-CN-XiaoyiNeural', '女', '普通话女声', 'cheerful'],
  ['zh-CN', 'zh-CN-YunyangNeural', '男', '普通话男声', 'narration-professional'],
  ['zh-CN', 'zh-CN-XiaochenNeural', '女', '普通话女声', 'livecommercial'],
  ['zh-CN', 'zh-CN-Xiaochen:DragonHDFlashLatestNeural', '女', '普通话 HD Flash 女声', 'debating'],
  ['zh-CN', 'zh-CN-XiaochenMultilingualNeural', '女', '普通话多语言女声'],
  ['zh-CN', 'zh-CN-Xiaohan:DragonHDFlashLatestNeural', '女', '普通话 HD Flash 女声', 'cheerful'],
  ['zh-CN', 'zh-CN-XiaohanNeural', '女', '普通话女声', 'cheerful'],
  ['zh-CN', 'zh-CN-XiaomengNeural', '女', '普通话女声', 'chat'],
  ['zh-CN', 'zh-CN-XiaomoNeural', '女', '普通话女声', 'cheerful'],
  ['zh-CN', 'zh-CN-XiaoqiuNeural', '女', '普通话女声'],
  ['zh-CN', 'zh-CN-XiaorouNeural', '女', '普通话女声'],
  ['zh-CN', 'zh-CN-XiaoruiNeural', '女', '普通话女声', 'calm'],
  ['zh-CN', 'zh-CN-Xiaoshuang:DragonHDFlashLatestNeural', '女', '普通话 HD Flash 童声', 'chat'],
  ['zh-CN', 'zh-CN-XiaoshuangMultilingualNeural', '女', '普通话多语言童声', 'chat'],
  ['zh-CN', 'zh-CN-XiaoshuangNeural', '女', '普通话童声', 'chat'],
  ['zh-CN', 'zh-CN-XiaoxiaoDialectsNeural', '女', '普通话方言女声'],
  ['zh-CN', 'zh-CN-XiaoxiaoMultilingualNeural', '女', '普通话多语言女声', 'cheerful'],
  ['zh-CN', 'zh-CN-XiaoyanNeural', '女', '普通话女声'],
  ['zh-CN', 'zh-CN-Xiaoyi:DragonHDFlashLatestNeural', '女', '普通话 HD Flash 女声', 'cheerful'],
  ['zh-CN', 'zh-CN-Xiaoyou:DragonHDFlashLatestNeural', '女', '普通话 HD Flash 童声', 'chat'],
  ['zh-CN', 'zh-CN-XiaoyouMultilingualNeural', '女', '普通话多语言童声', 'chat'],
  ['zh-CN', 'zh-CN-XiaoyouNeural', '女', '普通话童声'],
  ['zh-CN', 'zh-CN-Xiaoyu:DragonHDFlashLatestNeural', '女', '普通话 HD Flash 女声', 'debating'],
  ['zh-CN', 'zh-CN-XiaoyuMultilingualNeural', '女', '普通话多语言女声'],
  ['zh-CN', 'zh-CN-XiaozhenNeural', '女', '普通话女声', 'cheerful'],
  ['zh-CN', 'zh-CN-YunfanMultilingualNeural', '男', '普通话多语言男声'],
  ['zh-CN', 'zh-CN-YunfengNeural', '男', '普通话男声', 'cheerful'],
  ['zh-CN', 'zh-CN-Yunhan:DragonHDFlashLatestNeural', '男', '普通话 HD Flash 男声', 'cheerful'],
  ['zh-CN', 'zh-CN-YunhaoNeural', '男', '普通话男声', 'advertisement-upbeat'],
  ['zh-CN', 'zh-CN-YunjieNeural', '男', '普通话男声'],
  ['zh-CN', 'zh-CN-Yunxi:DragonHDFlashLatestNeural', '男', '普通话 HD Flash 男声', 'chat'],
  ['zh-CN', 'zh-CN-Yunxia:DragonHDFlashLatestNeural', '男', '普通话 HD Flash 男声', 'cheerful'],
  ['zh-CN', 'zh-CN-YunxiaNeural', '男', '普通话男声', 'cheerful'],
  ['zh-CN', 'zh-CN-YunxiaoMultilingualNeural', '男', '普通话多语言男声'],
  ['zh-CN', 'zh-CN-Yunye:DragonHDFlashLatestNeural', '男', '普通话 HD Flash 男声'],
  ['zh-CN', 'zh-CN-YunyeNeural', '男', '普通话男声', 'cheerful'],
  ['zh-CN', 'zh-CN-YunyiMultilingualNeural', '男', '普通话多语言男声'],
  ['zh-CN', 'zh-CN-YunzeNeural', '男', '普通话男声', 'calm'],
  ['zh-CN-guangxi', 'zh-CN-guangxi-YunqiNeural', '男', '广西口音普通话男声'],
  ['zh-CN-henan', 'zh-CN-henan-YundengNeural', '男', '河南中原官话男声'],
  ['zh-CN-liaoning', 'zh-CN-liaoning-XiaobeiNeural', '女', '东北普通话女声'],
  ['zh-CN-liaoning', 'zh-CN-liaoning-YunbiaoNeural', '男', '东北普通话男声'],
  ['zh-CN-shaanxi', 'zh-CN-shaanxi-XiaoniNeural', '女', '陕西中原官话女声'],
  ['zh-CN-shandong', 'zh-CN-shandong-YunxiangNeural', '男', '山东冀鲁官话男声'],
  ['zh-CN-sichuan', 'zh-CN-sichuan-YunxiNeural', '男', '四川西南官话男声'],
  ['zh-HK', 'zh-HK-HiuMaanNeural', '女', '粤语（香港）女声'],
  ['zh-HK', 'zh-HK-WanLungNeural', '男', '粤语（香港）男声'],
  ['zh-HK', 'zh-HK-HiuGaaiNeural', '女', '粤语（香港）女声'],
  ['zh-TW', 'zh-TW-HsiaoChenNeural', '女', '台湾普通话女声'],
  ['zh-TW', 'zh-TW-YunJheNeural', '男', '台湾普通话男声'],
  ['zh-TW', 'zh-TW-HsiaoYuNeural', '女', '台湾普通话女声']
].map(([language, voiceId, gender, description, style = '']) => ({
  name: `Azure ${description}`,
  provider: 'azure',
  voiceId,
  language,
  gender,
  style,
  rate: '0%',
  pitch: '0%',
  temperature: 0.85,
  sampleText: '你好，我正在为这局游戏进行语音试听。',
  description: `Azure Speech ${description}。部分 HD/预览音色可能受 Azure 区域限制。`,
  enabled: true
}));

const DEFAULT_WEREWOLF_MODES = [
  {
    id: 'standard-12',
    name: '标准12人局',
    description: '预女猎白：4狼人、预言家、女巫、猎人、白痴、4平民。',
    roles: [
      { roleId: 'werewolf', count: 4 },
      { roleId: 'seer', count: 1 },
      { roleId: 'witch', count: 1 },
      { roleId: 'hunter', count: 1 },
      { roleId: 'idiot', count: 1 },
      { roleId: 'villager', count: 4 }
    ],
    sheriff: { enabled: true, firstDayElection: true, voteWeight: 1.5 },
    winCondition: 'side',
    sortOrder: 1,
    enabled: true
  },
  {
    id: 'guard-12',
    name: '守卫12人局',
    description: '4狼人、预言家、女巫、猎人、守卫、3平民。',
    roles: [
      { roleId: 'werewolf', count: 4 },
      { roleId: 'seer', count: 1 },
      { roleId: 'witch', count: 1 },
      { roleId: 'hunter', count: 1 },
      { roleId: 'guard', count: 1 },
      { roleId: 'villager', count: 4 }
    ],
    sheriff: { enabled: true, firstDayElection: true, voteWeight: 1.5 },
    winCondition: 'side',
    sortOrder: 2,
    enabled: true
  }
];

const DEFAULT_WEREWOLF_ROLES = [
  { id: 'werewolf', name: '狼人', faction: 'wolves', roleType: 'wolf', responsibility: '夜晚参与击杀，白天伪装好人并引导票型。', ability: '夜晚选择击杀目标。', keyInfo: '知道其他狼人同伴。', rule: { actions: [{ trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' }] }, sortOrder: 1 },
  { id: 'seer', name: '预言家', faction: 'good', roleType: 'god', responsibility: '通过查验帮助好人阵营找出狼人。', ability: '每晚查验一名玩家阵营。', keyInfo: '查验结果只对自己可见。', rule: { actions: [{ trigger: 'night', action: 'inspectFaction', targetRule: 'alive-not-self' }] }, sortOrder: 2 },
  { id: 'witch', name: '女巫', faction: 'good', roleType: 'god', responsibility: '根据夜晚刀口决定是否使用解药或毒药。', ability: '一瓶解药、一瓶毒药，各只能使用一次。', keyInfo: '首夜可自救；默认一晚只能用一瓶药。', rule: { actions: [{ trigger: 'night', action: 'save', limit: 'once' }, { trigger: 'night', action: 'poison', limit: 'once' }] }, sortOrder: 3 },
  { id: 'hunter', name: '猎人', faction: 'good', roleType: 'god', responsibility: '死亡时可带走高度怀疑目标。', ability: '死亡或放逐时开枪带走一名玩家。', keyInfo: '被女巫毒死时不能开枪。', rule: { actions: [{ trigger: 'death', action: 'shootOnDeath', disabledDeathReasons: ['女巫毒药'] }] }, sortOrder: 4 },
  { id: 'guard', name: '守卫', faction: 'good', roleType: 'god', responsibility: '夜晚保护关键好人。', ability: '每晚守护一名玩家，不能连续守同一人。', keyInfo: '守护目标被狼人击杀时可避免死亡。', rule: { actions: [{ trigger: 'night', action: 'guard', targetRule: 'alive', limit: 'not-same-last-night' }] }, sortOrder: 5 },
  { id: 'idiot', name: '白痴', faction: 'good', roleType: 'god', responsibility: '通过发言和票型帮助好人，被放逐时可翻牌。', ability: '首次被白天放逐时翻牌免死并失去投票权。', keyInfo: '翻牌后仍可发言。', rule: { actions: [{ trigger: 'exile', action: 'surviveExileOnce' }] }, sortOrder: 6 },
  { id: 'villager', name: '村民', faction: 'good', roleType: 'villager', responsibility: '依靠发言、票型和死亡信息找出狼人。', ability: '白天发言和投票。', keyInfo: '没有夜晚技能。', rule: { actions: [{ trigger: 'day', action: 'speakOnly' }, { trigger: 'vote', action: 'voteOnly' }] }, sortOrder: 7 }
];

const EXECUTABLE_WEREWOLF_ACTIONS = new Set(['kill', 'inspectFaction', 'save', 'poison', 'guard', 'shootOnDeath', 'surviveExileOnce', 'voteOnly', 'speakOnly']);

function initAdminData() {
  const db = getDb();
  if (db.prepare('SELECT COUNT(*) AS count FROM skins').get().count === 0) {
    importMarkdownSkins();
  }
  if (db.prepare('SELECT COUNT(*) AS count FROM players').get().count === 0) {
    seedPlayers();
  }
  seedAdminCatalogs();
}

function toJson(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function skinToRow(template) {
  return {
    id: template.id || slugifyId(template.name),
    name: template.name,
    version: template.version || 'v3.2',
    source: template.source || 'admin',
    terms_json: toJson(template.terms || {}),
    background: template.background || '',
    truth: template.truth || '',
    clues_json: toJson(template.clues || []),
    noises_json: toJson(template.noises || []),
    memory_examples_json: toJson(template.memoryExamples || template.memory_examples || []),
    enabled: Number(template.enabled !== false)
  };
}

function rowToSkin(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    source: row.source,
    terms: parseJson(row.terms_json, {}),
    background: row.background,
    truth: row.truth,
    clues: parseJson(row.clues_json, []),
    noises: parseJson(row.noises_json, []),
    memoryExamples: parseJson(row.memory_examples_json, []),
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function upsertSkin(template) {
  const row = skinToRow(template);
  getDb().prepare(`
    INSERT INTO skins (id, name, version, source, terms_json, background, truth, clues_json, noises_json, memory_examples_json, enabled, created_at, updated_at)
    VALUES (@id, @name, @version, @source, @terms_json, @background, @truth, @clues_json, @noises_json, @memory_examples_json, @enabled, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      version = excluded.version,
      source = excluded.source,
      terms_json = excluded.terms_json,
      background = excluded.background,
      truth = excluded.truth,
      clues_json = excluded.clues_json,
      noises_json = excluded.noises_json,
      memory_examples_json = excluded.memory_examples_json,
      enabled = excluded.enabled,
      updated_at = CURRENT_TIMESTAMP
  `).run(row);
  return getSkin(row.id);
}

function importMarkdownSkins() {
  const templates = getMarkdownSkinTemplates();
  const skins = templates.length ? templates : [BUILTIN_TEMPLATE];
  const tx = getDb().transaction(() => {
    skins.forEach(upsertSkin);
  });
  tx();
  return listSkins();
}

function listSkins({ enabledOnly = false } = {}) {
  const rows = getDb().prepare(`SELECT * FROM skins ${enabledOnly ? 'WHERE enabled = 1' : ''} ORDER BY updated_at DESC, name ASC`).all();
  return rows.map(rowToSkin);
}

function getSkin(id) {
  return rowToSkin(getDb().prepare('SELECT * FROM skins WHERE id = ?').get(id));
}

function getRandomEnabledSkin(rng = Math.random) {
  const skins = listSkins({ enabledOnly: true });
  const pool = skins.length ? skins : [BUILTIN_TEMPLATE];
  return pool[Math.floor(rng() * pool.length)];
}

function createSkin(input) {
  const id = input.id || slugifyId(input.name);
  if (getSkin(id)) throw new Error(`皮肤已存在：${id}`);
  return upsertSkin({ ...input, id, source: input.source || 'admin', enabled: input.enabled !== false });
}

function updateSkin(id, input) {
  if (!getSkin(id)) throw new Error('皮肤不存在');
  return upsertSkin({ ...input, id, source: input.source || 'admin', enabled: input.enabled !== false });
}

function importSkinJson(input) {
  const skin = typeof input?.raw === 'string' ? parseSkinJson(input.raw) : input;
  const normalized = normalizeImportedSkin(skin);
  return upsertSkin(normalized);
}

function parseSkinJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throwImportError('皮肤导入失败：JSON 格式不正确。', getSkinImportTemplate());
  }
}

function normalizeImportedSkin(raw) {
  if (!raw || typeof raw !== 'object') throwImportError('皮肤导入失败：需要一个 JSON 对象。', getSkinImportTemplate());
  if (!raw.name || !raw.background || !raw.truth || !Array.isArray(raw.clues)) {
    throwImportError('皮肤导入失败：需要 name、background、truth、clues 字段。', getSkinImportTemplate());
  }
  return {
    id: raw.id || slugifyId(raw.name),
    name: raw.name,
    version: raw.version || 'v3.2',
    source: raw.source || 'json',
    terms: raw.terms || {},
    background: raw.background,
    truth: raw.truth,
    clues: raw.clues,
    noises: raw.noises || [],
    memoryExamples: raw.memoryExamples || raw.memory_examples || [],
    enabled: raw.enabled !== false
  };
}

function getSkinImportTemplate() {
  return {
    id: 'skin-demo',
    name: '皮肤名称',
    version: 'v3.2',
    source: 'json',
    terms: {},
    background: '事件背景',
    truth: '真相',
    clues: [{ title: '线索标题', text: '线索内容' }],
    noises: [],
    memoryExamples: [],
    enabled: true
  };
}

function setSkinEnabled(id, enabled) {
  getDb().prepare('UPDATE skins SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(enabled ? 1 : 0, id);
  return getSkin(id);
}

function deleteSkin(id) {
  const refs = getDb().prepare('SELECT COUNT(*) AS count FROM games WHERE skin_id = ?').get(id).count;
  if (refs > 0) throw new Error('该皮肤已被历史对局引用，不能删除');
  getDb().prepare('DELETE FROM skins WHERE id = ?').run(id);
  return { ok: true };
}

function seedPlayers() {
  const players = readConfigPlayers();
  const tx = getDb().transaction(() => {
    players.forEach((player, index) => upsertPlayer({ ...player, sort_order: player.sort_order ?? index + 1 }));
  });
  tx();
  return listPlayers();
}

function readConfigPlayers() {
  return DEFAULT_PLAYERS;
}

function playerToRow(input) {
  return {
    id: Number(input.id),
    nickname: input.nickname || input.name || `${input.id}号`,
    name: input.name || input.nickname || `${input.id}号`,
    avatar: input.avatar || '',
    sex: input.sex || '未知',
    personality: input.personality || '',
    provider: input.provider || 'deepseek',
    model: input.model || 'deepseek-v4-pro',
    model_id: input.modelId ? Number(input.modelId) : input.model_id ? Number(input.model_id) : null,
    voice_package_id: input.voicePackageId ? Number(input.voicePackageId) : input.voice_package_id ? Number(input.voice_package_id) : null,
    temperature: Number(input.temperature ?? 0.85),
    enabled: Number(input.enabled !== false),
    sort_order: Number(input.sort_order ?? input.sortOrder ?? input.id ?? 0)
  };
}

function rowToPlayer(row) {
  if (!row) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    name: row.name,
    avatar: row.avatar,
    sex: row.sex,
    personality: row.personality,
    provider: row.provider,
    model: row.model,
    modelId: row.model_id,
    voicePackageId: row.voice_package_id,
    temperature: row.temperature,
    enabled: Boolean(row.enabled),
    sort_order: row.sort_order,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function upsertPlayer(input) {
  const row = playerToRow(input);
  getDb().prepare(`
    INSERT INTO players (id, nickname, name, avatar, sex, personality, provider, model, model_id, voice_package_id, temperature, enabled, sort_order, created_at, updated_at)
    VALUES (@id, @nickname, @name, @avatar, @sex, @personality, @provider, @model, @model_id, @voice_package_id, @temperature, @enabled, @sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      nickname = excluded.nickname,
      name = excluded.name,
      avatar = excluded.avatar,
      sex = excluded.sex,
      personality = excluded.personality,
      provider = excluded.provider,
      model = excluded.model,
      model_id = excluded.model_id,
      voice_package_id = excluded.voice_package_id,
      temperature = excluded.temperature,
      enabled = excluded.enabled,
      sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `).run(row);
  return getPlayer(row.id);
}

function listPlayers({ enabledOnly = false } = {}) {
  const rows = getDb().prepare(`SELECT * FROM players ${enabledOnly ? 'WHERE enabled = 1' : ''} ORDER BY sort_order ASC, id ASC`).all();
  return rows.map(rowToPlayer);
}

function getPlayer(id) {
  return rowToPlayer(getDb().prepare('SELECT * FROM players WHERE id = ?').get(Number(id)));
}

function createPlayer(input) {
  const maxId = getDb().prepare('SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM players').get().nextId;
  const id = Number(input.id || maxId);
  if (getPlayer(id)) throw new Error(`玩家已存在：${id}`);
  return upsertPlayer({ ...input, id });
}

function updatePlayer(id, input) {
  if (!getPlayer(id)) throw new Error('玩家不存在');
  return upsertPlayer({ ...input, id: Number(id) });
}

function setPlayerEnabled(id, enabled) {
  getDb().prepare('UPDATE players SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(enabled ? 1 : 0, Number(id));
  return getPlayer(id);
}

function reorderPlayers(items = []) {
  const tx = getDb().transaction(() => {
    items.forEach((item, index) => {
      getDb().prepare('UPDATE players SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(item.sort_order ?? item.sortOrder ?? index + 1), Number(item.id));
    });
  });
  tx();
  return listPlayers();
}

function deletePlayer(id) {
  const refs = getDb().prepare('SELECT COUNT(*) AS count FROM game_players WHERE player_id = ?').get(Number(id)).count;
  if (refs > 0) throw new Error('该玩家已被历史对局引用，不能删除');
  getDb().prepare('DELETE FROM players WHERE id = ?').run(Number(id));
  const settings = getAppSettings();
  if (Number(settings.defaultHostPlayerId) === Number(id)) setDefaultHostPlayerId(null);
  return { ok: true };
}

function getAppSettings() {
  return {
    defaultHostPlayerId: getSetting('defaultHostPlayerId', null)
  };
}

function setDefaultHostPlayerId(playerId) {
  const value = Number(playerId) || null;
  if (value && !getPlayer(value)) throw new Error('默认主持人玩家不存在');
  setSetting('defaultHostPlayerId', value);
  return getAppSettings();
}

function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value_json AS valueJson FROM app_settings WHERE key = ?').get(key);
  if (!row) return fallback;
  return parseJson(row.valueJson, fallback);
}

function setSetting(key, value) {
  getDb().prepare(`
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = CURRENT_TIMESTAMP
  `).run(key, toJson(value));
}

function seedAdminCatalogs() {
  const db = getDb();
  if (db.prepare('SELECT COUNT(*) AS count FROM models').get().count === 0) {
    DEFAULT_MODELS.forEach((model) => createModel(model));
  }
  if (db.prepare('SELECT COUNT(*) AS count FROM voice_packages').get().count === 0) {
    DEFAULT_VOICE_PACKAGES.forEach((voice) => createVoicePackage(voice));
  }
  seedMissingAzureVoicePackages();
  if (db.prepare('SELECT COUNT(*) AS count FROM werewolf_roles').get().count === 0) {
    DEFAULT_WEREWOLF_ROLES.forEach((role) => upsertWerewolfRole(role));
  }
  if (db.prepare('SELECT COUNT(*) AS count FROM werewolf_modes').get().count === 0) {
    DEFAULT_WEREWOLF_MODES.forEach((mode) => upsertWerewolfMode(mode));
  }
}

function seedMissingAzureVoicePackages() {
  const existingVoiceIds = new Set(
    listVoicePackages()
      .filter((voice) => String(voice.provider).toLowerCase() === 'azure')
      .map((voice) => String(voice.voiceId || '').toLowerCase())
      .filter(Boolean)
  );
  DEFAULT_AZURE_VOICE_PACKAGES.forEach((voice) => {
    const voiceId = String(voice.voiceId || '').toLowerCase();
    if (!voiceId || existingVoiceIds.has(voiceId)) return;
    createVoicePackage(voice);
    existingVoiceIds.add(voiceId);
  });
}

function getSecretKey() {
  const secret = process.env.ADMIN_SECRET || process.env.API_KEY_SECRET || 'consensus-mist-local-admin-secret';
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptApiKey(value) {
  const plain = String(value || '').trim();
  if (!plain) return {};
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return {
    api_key_cipher: encrypted.toString('base64'),
    api_key_iv: iv.toString('base64'),
    api_key_tag: cipher.getAuthTag().toString('base64')
  };
}

function decryptApiKey(row) {
  if (!row?.api_key_cipher || !row?.api_key_iv || !row?.api_key_tag) return '';
  const decipher = crypto.createDecipheriv('aes-256-gcm', getSecretKey(), Buffer.from(row.api_key_iv, 'base64'));
  decipher.setAuthTag(Buffer.from(row.api_key_tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(row.api_key_cipher, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

function rowToModel(row) {
  if (!row) return null;
  const hasApiKey = Boolean(row.api_key_cipher);
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    baseUrl: row.base_url,
    apiFormat: row.api_format,
    hasApiKey,
    apiKey: hasApiKey ? decryptApiKey(row) : '',
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToRuntimeModel(row) {
  if (!row) return null;
  return {
    ...rowToModel(row),
    apiKey: decryptApiKey(row)
  };
}

function modelToRow(input, existing = null) {
  const encrypted = Object.prototype.hasOwnProperty.call(input, 'apiKey') && String(input.apiKey || '').trim()
    ? encryptApiKey(input.apiKey)
    : {};
  return {
    provider: String(input.provider || existing?.provider || '').trim(),
    name: String(input.name || input.modelName || existing?.name || '').trim(),
    base_url: String(input.baseUrl || input.base_url || existing?.base_url || '').trim(),
    api_format: normalizeApiFormat(input.apiFormat || input.api_format || existing?.api_format || 'openai-compatible'),
    api_key_cipher: encrypted.api_key_cipher ?? existing?.api_key_cipher ?? '',
    api_key_iv: encrypted.api_key_iv ?? existing?.api_key_iv ?? '',
    api_key_tag: encrypted.api_key_tag ?? existing?.api_key_tag ?? '',
    enabled: Number(input.enabled !== false)
  };
}

function normalizeApiFormat(value) {
  const text = String(value || 'openai-compatible').trim();
  if (text === 'anthropic-compatible') return text;
  return 'openai-compatible';
}

function listModels() {
  return getDb().prepare('SELECT * FROM models ORDER BY updated_at DESC, id DESC').all().map(rowToModel);
}

function getModel(id) {
  return rowToModel(getDb().prepare('SELECT * FROM models WHERE id = ?').get(Number(id)));
}

function getRuntimeModel(id) {
  return rowToRuntimeModel(getDb().prepare('SELECT * FROM models WHERE id = ?').get(Number(id)));
}

function createModel(input) {
  const row = modelToRow(input);
  if (!row.provider || !row.name) throw new Error('供应商和模型名称必填');
  const result = getDb().prepare(`
    INSERT INTO models (provider, name, base_url, api_format, api_key_cipher, api_key_iv, api_key_tag, enabled, created_at, updated_at)
    VALUES (@provider, @name, @base_url, @api_format, @api_key_cipher, @api_key_iv, @api_key_tag, @enabled, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(row);
  return getModel(result.lastInsertRowid);
}

function updateModel(id, input) {
  const existing = getDb().prepare('SELECT * FROM models WHERE id = ?').get(Number(id));
  if (!existing) throw new Error('模型不存在');
  const row = { ...modelToRow(input, existing), id: Number(id) };
  getDb().prepare(`
    UPDATE models
    SET provider = @provider, name = @name, base_url = @base_url, api_format = @api_format,
        api_key_cipher = @api_key_cipher, api_key_iv = @api_key_iv, api_key_tag = @api_key_tag,
        enabled = @enabled, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run(row);
  return getModel(id);
}

function deleteModel(id) {
  getDb().prepare('UPDATE players SET model_id = NULL WHERE model_id = ?').run(Number(id));
  getDb().prepare('DELETE FROM models WHERE id = ?').run(Number(id));
  return { ok: true };
}

function rowToVoicePackage(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    voiceId: row.voice_id,
    language: row.language,
    gender: row.gender || '',
    style: row.style || '',
    rate: row.rate || '0%',
    pitch: row.pitch || '0%',
    temperature: Number(row.temperature ?? 0.85),
    sampleText: row.sample_text || '',
    description: row.description,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function voicePackageToRow(input) {
  return {
    name: String(input.name || '').trim(),
    provider: String(input.provider || 'browser').trim(),
    voice_id: String(input.voiceId || input.voice_id || '').trim(),
    language: String(input.language || 'zh-CN').trim(),
    gender: String(input.gender || '').trim(),
    style: String(input.style || '').trim(),
    rate: String(input.rate || '0%').trim(),
    pitch: String(input.pitch || '0%').trim(),
    temperature: Number(input.temperature ?? 0.85),
    sample_text: String(input.sampleText || input.sample_text || '').trim(),
    description: String(input.description || '').trim(),
    enabled: Number(input.enabled !== false)
  };
}

function listVoicePackages() {
  return getDb().prepare('SELECT * FROM voice_packages ORDER BY updated_at DESC, id DESC').all().map(rowToVoicePackage);
}

function getVoicePackage(id) {
  return rowToVoicePackage(getDb().prepare('SELECT * FROM voice_packages WHERE id = ?').get(Number(id)));
}

function createVoicePackage(input) {
  const row = voicePackageToRow(input);
  if (!row.name) throw new Error('语音包名称必填');
  const result = getDb().prepare(`
    INSERT INTO voice_packages (name, provider, voice_id, language, gender, style, rate, pitch, temperature, sample_text, description, enabled, created_at, updated_at)
    VALUES (@name, @provider, @voice_id, @language, @gender, @style, @rate, @pitch, @temperature, @sample_text, @description, @enabled, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(row);
  return getVoicePackage(result.lastInsertRowid);
}

function updateVoicePackage(id, input) {
  if (!getVoicePackage(id)) throw new Error('语音包不存在');
  const row = { ...voicePackageToRow(input), id: Number(id) };
  getDb().prepare(`
    UPDATE voice_packages
    SET name = @name, provider = @provider, voice_id = @voice_id, language = @language,
        gender = @gender, style = @style, rate = @rate, pitch = @pitch, temperature = @temperature, sample_text = @sample_text,
        description = @description, enabled = @enabled, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run(row);
  return getVoicePackage(id);
}

function pinVoicePackage(id) {
  const voice = getVoicePackage(id);
  if (!voice) throw new Error('语音包不存在');
  const minSortOrder = listVoicePackages().reduce((min, item) => Math.min(min, Number(item.sortOrder || 0)), 0);
  return updateVoicePackage(id, { ...voice, sortOrder: minSortOrder - 1 });
}

function deleteVoicePackage(id) {
  getDb().prepare('UPDATE players SET voice_package_id = NULL WHERE voice_package_id = ?').run(Number(id));
  getDb().prepare('DELETE FROM voice_packages WHERE id = ?').run(Number(id));
  return { ok: true };
}

function rowToWerewolfRole(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    faction: row.faction,
    roleType: row.role_type,
    responsibility: row.responsibility,
    ability: row.ability,
    keyInfo: row.key_info,
    rule: parseJson(row.rule_json, {}),
    description: row.description,
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function werewolfRoleToRow(input) {
  const row = {
    id: String(input.id || slugifyPlainId(input.name || 'role')).trim(),
    name: String(input.name || '').trim(),
    faction: normalizeWerewolfFaction(input.faction),
    role_type: normalizeWerewolfRoleType(input.roleType || input.role_type),
    responsibility: String(input.responsibility || '').trim(),
    ability: String(input.ability || '').trim(),
    key_info: String(input.keyInfo || input.key_info || '').trim(),
    rule_json: toJson(normalizeWerewolfRoleRule(input.rule || input.rule_json || {})),
    enabled: Number(input.enabled !== false),
    sort_order: Number(input.sortOrder ?? input.sort_order ?? 0)
  };
  if (!row.id || !row.name) throw new Error('角色 ID 和名称必填');
  validateWerewolfRoleRule(parseJson(row.rule_json, {}), Boolean(row.enabled));
  return row;
}

function upsertWerewolfRole(input) {
  const row = werewolfRoleToRow(input);
  getDb().prepare(`
    INSERT INTO werewolf_roles (id, name, faction, role_type, responsibility, ability, key_info, rule_json, enabled, sort_order, created_at, updated_at)
    VALUES (@id, @name, @faction, @role_type, @responsibility, @ability, @key_info, @rule_json, @enabled, @sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      faction = excluded.faction,
      role_type = excluded.role_type,
      responsibility = excluded.responsibility,
      ability = excluded.ability,
      key_info = excluded.key_info,
      rule_json = excluded.rule_json,
      enabled = excluded.enabled,
      sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `).run(row);
  return getWerewolfRole(row.id);
}

function listWerewolfRoles(options = {}) {
  const roles = getDb().prepare('SELECT * FROM werewolf_roles ORDER BY sort_order ASC, name ASC').all().map(rowToWerewolfRole);
  return options.enabledOnly ? roles.filter((role) => role.enabled) : roles;
}

function getWerewolfRole(id) {
  return rowToWerewolfRole(getDb().prepare('SELECT * FROM werewolf_roles WHERE id = ?').get(String(id)));
}

function deleteWerewolfRole(id) {
  const roleId = String(id);
  const refs = getDb().prepare('SELECT COUNT(*) AS count FROM werewolf_modes WHERE roles_json LIKE ?').get(`%"${roleId}"%`).count;
  if (refs > 0) throw new Error('该角色已被狼人杀模式引用，不能删除');
  getDb().prepare('DELETE FROM werewolf_roles WHERE id = ?').run(roleId);
  return { ok: true };
}

function rowToWerewolfMode(row) {
  if (!row) return null;
  const roles = parseJson(row.roles_json, []);
  const sheriff = parseJson(row.sheriff_json, {});
  const rules = parseJson(row.rules_json, {});
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    roles,
    roleCounts: roles,
    rules,
    sheriff,
    winCondition: row.win_condition || 'side',
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
    playerCount: roles.reduce((sum, item) => sum + Number(item.count || 0), 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function werewolfModeToRow(input) {
  const roles = normalizeWerewolfModeRoles(input.roles || input.roleCounts || input.roles_json || []);
  const sheriff = normalizeWerewolfSheriff(input.sheriff || input.sheriff_json || {});
  const rules = input.rules || input.rules_json || {};
  const row = {
    id: String(input.id || slugifyPlainId(input.name || 'mode')).trim(),
    name: String(input.name || '').trim(),
    description: String(input.description || '').trim(),
    roles_json: toJson(roles),
    rules_json: toJson(rules && typeof rules === 'object' ? rules : {}),
    sheriff_json: toJson(sheriff),
    win_condition: normalizeWerewolfWinCondition(input.winCondition || input.win_condition),
    enabled: Number(input.enabled !== false),
    sort_order: Number(input.sortOrder ?? input.sort_order ?? 0)
  };
  if (!row.id || !row.name) throw new Error('模式 ID 和名称必填');
  validateWerewolfMode({ ...row, roles, sheriff, winCondition: row.win_condition });
  return row;
}

function upsertWerewolfMode(input) {
  const row = werewolfModeToRow(input);
  getDb().prepare(`
    INSERT INTO werewolf_modes (id, name, description, roles_json, rules_json, sheriff_json, win_condition, enabled, sort_order, created_at, updated_at)
    VALUES (@id, @name, @description, @roles_json, @rules_json, @sheriff_json, @win_condition, @enabled, @sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      roles_json = excluded.roles_json,
      rules_json = excluded.rules_json,
      sheriff_json = excluded.sheriff_json,
      win_condition = excluded.win_condition,
      enabled = excluded.enabled,
      sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `).run(row);
  return getWerewolfMode(row.id);
}

function listWerewolfModes() {
  return getDb().prepare('SELECT * FROM werewolf_modes ORDER BY sort_order ASC, name ASC').all().map(rowToWerewolfMode);
}

function getWerewolfMode(id) {
  return rowToWerewolfMode(getDb().prepare('SELECT * FROM werewolf_modes WHERE id = ?').get(String(id)));
}

function deleteWerewolfMode(id) {
  getDb().prepare('DELETE FROM werewolf_modes WHERE id = ?').run(String(id));
  return { ok: true };
}

function normalizeWerewolfModeRoles(value) {
  const list = Array.isArray(value) ? value : parseJson(value, []);
  return list
    .map((item) => ({
      roleId: String(item.roleId || item.role_id || item.id || '').trim(),
      count: Math.max(0, Number(item.count || 0))
    }))
    .filter((item) => item.roleId && item.count > 0);
}

function normalizeWerewolfSheriff(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    enabled: Boolean(source.enabled),
    firstDayElection: source.firstDayElection !== false,
    voteWeight: Number(source.voteWeight || source.vote_weight || 1.5)
  };
}

function normalizeWerewolfFaction(value) {
  return String(value || '').toLowerCase() === 'wolves' ? 'wolves' : 'good';
}

function normalizeWerewolfRoleType(value) {
  const text = String(value || 'villager').trim();
  if (['wolf', 'god', 'villager'].includes(text)) return text;
  return 'villager';
}

function normalizeWerewolfWinCondition(value) {
  const text = String(value || 'side').trim();
  if (['side', 'gods', 'villagers', 'all'].includes(text)) return text;
  return 'side';
}

function normalizeWerewolfRoleRule(value) {
  if (typeof value === 'string') return parseJson(value, {});
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function validateWerewolfRoleRule(rule, strict = true) {
  const actions = Array.isArray(rule.actions) ? rule.actions : [];
  if (!strict) return;
  const unknown = actions.map((item) => String(item.action || '')).filter((action) => action && !EXECUTABLE_WEREWOLF_ACTIONS.has(action));
  if (unknown.length) throw new Error(`角色包含暂不可执行能力：${unknown.join('、')}。启用角色只允许使用可执行 DSL。`);
}

function validateWerewolfMode(row) {
  if (!Number(row.enabled)) return;
  const roles = row.roles || [];
  if (!roles.length) throw new Error('启用模式必须配置角色阵容');
  const roleMap = new Map(listWerewolfRoles().map((role) => [role.id, role]));
  let wolves = 0;
  let good = 0;
  roles.forEach((item) => {
    const role = roleMap.get(item.roleId);
    if (!role) throw new Error(`模式引用了不存在的角色：${item.roleId}`);
    if (!role.enabled) throw new Error(`模式引用了已停用角色：${role.name}`);
    validateWerewolfRoleRule(role.rule, true);
    if (role.faction === 'wolves') wolves += item.count;
    else good += item.count;
  });
  if (!wolves || !good) throw new Error('启用模式至少需要狼人阵营和好人阵营');
  if (roles.reduce((sum, item) => sum + item.count, 0) < 3) throw new Error('启用模式人数不能少于 3 人');
}

function slugifyPlainId(text) {
  return String(text || 'item').toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '') || String(Date.now());
}

function saveGameRecord(game) {
  if (!game?.id) return null;
  const db = getDb();
  const gameType = normalizeGameType(game.type || game.gameType || game.id);
  const requestedSkinId = game.event?.id || game.skinId || null;
  const skinId = gameType === 'consensus' && requestedSkinId && getSkin(requestedSkinId) ? requestedSkinId : null;
  const row = {
    id: game.id,
    game_type: gameType,
    mode: game.mode || 'real',
    skin_id: skinId,
    skin_name: game.event?.name || getGameTypeName(gameType),
    winner: game.winner || '',
    win_reason: game.winReason || '',
    topic_json: toJson(game.topic || {}),
    players_json: toJson(game.players || []),
    rounds_json: toJson(game.rounds || []),
    event_json: toJson(game.event || {}),
    audio_resources_json: toJson(normalizeAudioResources(game.audioResources || game.audio_resources || []))
  };
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO games (id, game_type, mode, skin_id, skin_name, winner, win_reason, topic_json, players_json, rounds_json, event_json, audio_resources_json, created_at)
      VALUES (@id, @game_type, @mode, @skin_id, @skin_name, @winner, @win_reason, @topic_json, @players_json, @rounds_json, @event_json, @audio_resources_json, COALESCE((SELECT created_at FROM games WHERE id = @id), CURRENT_TIMESTAMP))
    `).run(row);
    db.prepare('DELETE FROM game_players WHERE game_id = ?').run(game.id);
    (game.players || []).forEach((player) => {
      db.prepare('INSERT INTO game_players (game_id, player_id, player_snapshot_json) VALUES (?, ?, ?)').run(game.id, Number(player.id), toJson(player));
    });
  });
  tx();
  return getGame(game.id);
}

function listGames(filters = {}) {
  const conditions = [];
  const params = {};
  if (filters.gameType) {
    conditions.push('game_type = @gameType');
    params.gameType = normalizeGameType(filters.gameType);
  }
  if (filters.mode) {
    conditions.push('mode = @mode');
    params.mode = filters.mode;
  }
  if (filters.skinId) {
    conditions.push('skin_id = @skinId');
    params.skinId = filters.skinId;
  }
  if (filters.winner) {
    conditions.push('winner = @winner');
    params.winner = filters.winner;
  }
  if (filters.playerId) {
    conditions.push('id IN (SELECT game_id FROM game_players WHERE player_id = @playerId)');
    params.playerId = Number(filters.playerId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = getDb().prepare(`SELECT * FROM games ${where} ORDER BY created_at DESC LIMIT 200`).all(params);
  return rows.map(rowToGameSummary);
}

function getGame(id) {
  const row = getDb().prepare('SELECT * FROM games WHERE id = ?').get(id);
  return row ? rowToGame(row) : null;
}

function deleteGame(id) {
  const game = getGame(id);
  const retainedAudio = getAudioResourcesUsedByOtherGames(id);
  getDb().prepare('DELETE FROM games WHERE id = ?').run(id);
  cleanupGameAudioResources(collectGameAudioResources(game), retainedAudio);
  return { ok: true };
}

function rowToGameSummary(row) {
  const players = parseJson(row.players_json, []);
  const gameType = normalizeGameType(row.game_type || row.id || row.event_json);
  const event = parseJson(row.event_json, {});
  const topic = parseJson(row.topic_json, {});
  const modeName = event.werewolfMode?.name || event.modeName || event.mode?.name || '';
  const topicTitle = gameType === 'debate'
    ? topic.title || event.topic?.title || ''
    : gameType === 'werewolf'
      ? modeName || row.skin_name || getGameTypeName(gameType)
      : row.skin_name || event.name || getGameTypeName(gameType);
  return {
    id: row.id,
    gameType,
    gameTypeName: getGameTypeName(gameType),
    mode: row.mode,
    skinId: row.skin_id,
    skinName: row.skin_name || getGameTypeName(gameType),
    topicTitle,
    modeName,
    winner: row.winner,
    winReason: row.win_reason,
    playerCount: players.length,
    createdAt: row.created_at
  };
}

function rowToGame(row) {
  return {
    ...rowToGameSummary(row),
    topic: parseJson(row.topic_json, {}),
    players: parseJson(row.players_json, []),
    rounds: parseJson(row.rounds_json, []),
    event: parseJson(row.event_json, {}),
    audioResources: parseJson(row.audio_resources_json, [])
  };
}

function normalizeAudioResources(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter((item) => item.startsWith('/resources/audio/')))];
}

function getAudioResourcesUsedByOtherGames(gameId) {
  try {
    const rows = getDb().prepare('SELECT * FROM games WHERE id != ?').all(String(gameId));
    return new Set(rows.flatMap((row) => collectGameAudioResources(rowToGame(row))));
  } catch {
    return new Set();
  }
}

function collectGameAudioResources(game) {
  const values = new Set(normalizeAudioResources(game?.audioResources || []));
  collectNestedAudioResources(game, values);
  return [...values];
}

function collectNestedAudioResources(value, target) {
  if (!value) return;
  if (typeof value === 'string') {
    normalizeAudioResources([value]).forEach((url) => target.add(url));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectNestedAudioResources(item, target));
    return;
  }
  if (typeof value !== 'object') return;
  Object.entries(value).forEach(([key, nested]) => {
    if (key === 'audioUrl') normalizeAudioResources([nested]).forEach((url) => target.add(url));
    else if (key === 'audioSegments' || key === 'rounds' || key === 'phases' || key === 'event') collectNestedAudioResources(nested, target);
    else if (nested && typeof nested === 'object') collectNestedAudioResources(nested, target);
  });
}

function cleanupGameAudioResources(audioResources, retainedAudio = new Set()) {
  normalizeAudioResources(audioResources).forEach((url) => {
    if (retainedAudio.has(url)) return;
    try {
      deleteGeneratedAudioByUrl(url);
    } catch (error) {
      console.warn(`删除对局音频失败：${url} ${error.message}`);
    }
  });
}

function getAdminStats() {
  const db = getDb();
  const gameTypeRows = db.prepare('SELECT game_type AS gameType, COUNT(*) AS count FROM games GROUP BY game_type').all();
  const gamesByType = Object.fromEntries(gameTypeRows.map((row) => [normalizeGameType(row.gameType), row.count]));
  return {
    databasePath: getDatabasePath(),
    skins: db.prepare('SELECT COUNT(*) AS count FROM skins').get().count,
    enabledSkins: db.prepare('SELECT COUNT(*) AS count FROM skins WHERE enabled = 1').get().count,
    players: db.prepare('SELECT COUNT(*) AS count FROM players').get().count,
    enabledPlayers: db.prepare('SELECT COUNT(*) AS count FROM players WHERE enabled = 1').get().count,
    models: db.prepare('SELECT COUNT(*) AS count FROM models').get().count,
    voicePackages: db.prepare('SELECT COUNT(*) AS count FROM voice_packages').get().count,
    games: db.prepare('SELECT COUNT(*) AS count FROM games').get().count,
    gamesByType: {
      consensus: gamesByType.consensus || 0,
      debate: gamesByType.debate || 0,
      werewolf: gamesByType.werewolf || 0
    }
  };
}

function importGameRecord({ gameType, raw }) {
  const parsed = typeof raw === 'string' ? parseImportedRaw(raw, gameType) : raw;
  const normalized = normalizeImportedAdminGame(gameType, parsed);
  const saved = saveGameRecord(normalized);
  return { ok: true, game: saved };
}

function parseImportedRaw(raw, gameType) {
  try {
    return JSON.parse(raw);
  } catch {
    throwImportError('导入失败：JSON 格式不正确。', getImportTemplate(gameType));
  }
}

function normalizeImportedAdminGame(gameType, raw) {
  const type = normalizeGameType(gameType || raw?.type || raw?.gameType || raw?.id);
  if (type === 'debate') return normalizeImportedDebateGame(raw);
  if (type === 'werewolf') return normalizeImportedWerewolfGame(raw);
  return normalizeImportedConsensusGame(raw);
}

function normalizeImportedDebateGame(raw) {
  if (raw?.type === 'ai_debate_match') {
    const players = [
      ...((raw.teams?.affirmative?.members || []).map((player, index) => ({ ...normalizeImportedPlayer(player, index + 1), side: 'pro', sideIndex: index }))),
      ...((raw.teams?.negative?.members || []).map((player, index) => ({ ...normalizeImportedPlayer(player, index + 5), side: 'con', sideIndex: index }))),
      ...((raw.teams?.judges?.members || []).map((player, index) => ({ ...normalizeImportedPlayer(player, index + 9), side: 'judge', sideIndex: null })))
    ];
    if (players.filter((player) => player.side === 'pro').length !== 4 || players.filter((player) => player.side === 'con').length !== 4) {
      throwImportError('辩论赛导入失败：正反方都必须包含 4 名选手。', getImportTemplate('debate'));
    }
    return {
      id: `imported-debate-${Date.now()}`,
      type: 'debate',
      mode: 'imported',
      topic: {
        title: raw.metadata?.topic || raw.metadata?.title || '导入辩论赛',
        proPosition: raw.positions?.affirmative || raw.teams?.affirmative?.position || '正方立场',
        conPosition: raw.positions?.negative || raw.teams?.negative?.position || '反方立场'
      },
      event: { id: 'ai-debate', name: 'AI 辩论赛' },
      players,
      rounds: normalizeImportedRounds(raw.segments || []),
      winner: '',
      winReason: ''
    };
  }

  if (!raw?.topic || !Array.isArray(raw?.players) || !(Array.isArray(raw?.phases) || Array.isArray(raw?.rounds))) {
    throwImportError('辩论赛导入失败：需要 type/topic/players/phases 或 rounds。', getImportTemplate('debate'));
  }
  return {
    ...raw,
    id: raw.id || `imported-debate-${Date.now()}`,
    type: 'debate',
    mode: raw.mode || 'imported',
    event: raw.event || { id: 'ai-debate', name: 'AI 辩论赛' },
    rounds: raw.rounds || (raw.phases || []).map((phase, index) => ({ number: index + 1, phase: phase.id, title: phase.name, speeches: phase.speeches || [] }))
  };
}

function normalizeImportedWerewolfGame(raw) {
  if (!raw || !(raw.gameId || raw.id) || !Array.isArray(raw.players) || !Array.isArray(raw.rounds)) {
    throwImportError('狼人杀导入失败：需要 id/gameId、players、rounds。', getImportTemplate('werewolf'));
  }
  const hasRoles = raw.players.some((player) => player.role || player.roleLabel || player.camp || player.side);
  if (!hasRoles) throwImportError('狼人杀导入失败：玩家需包含角色或阵营信息。', getImportTemplate('werewolf'));
  return {
    ...raw,
    id: raw.id || raw.gameId || `imported-werewolf-${Date.now()}`,
    type: 'werewolf',
    mode: raw.mode || 'imported',
    event: raw.event || { id: 'ai-werewolf', name: 'AI 狼人杀' },
    winner: raw.winner || '',
    winReason: raw.winReason || ''
  };
}

function normalizeImportedConsensusGame(raw) {
  if (!raw?.event || !Array.isArray(raw?.players) || !Array.isArray(raw?.rounds)) {
    throwImportError('共识迷雾导入失败：需要 event、players、rounds。', getImportTemplate('consensus'));
  }
  return {
    ...raw,
    id: raw.id || `imported-consensus-${Date.now()}`,
    type: 'consensus',
    mode: raw.mode || 'imported',
    winner: raw.winner || '',
    winReason: raw.winReason || ''
  };
}

function normalizeImportedPlayer(player, fallbackId) {
  return {
    id: Number(player.id || fallbackId),
    name: player.name || player.nickname || `${fallbackId}号`,
    nickname: player.nickname || player.name || `${fallbackId}号`,
    avatar: player.avatar || player.avatarUrl || '',
    role: player.role || player.side || '',
    roleLabel: player.roleLabel || player.role || ''
  };
}

function normalizeImportedRounds(items = []) {
  return items.map((item, index) => ({
    number: index + 1,
    phase: item.id || item.type || `round-${index + 1}`,
    title: item.title || item.name || item.id || item.type || `第 ${index + 1} 轮`,
    speeches: item.speeches || item.items || []
  }));
}

function throwImportError(message, template) {
  const error = new Error(message);
  error.template = template;
  throw error;
}

function getImportTemplate(gameType) {
  const templates = {
    debate: {
      type: 'debate',
      topic: { title: '辩题', proPosition: '正方立场', conPosition: '反方立场' },
      players: [{ id: 1, nickname: '选手A', side: 'pro', sideIndex: 0 }],
      phases: [{ id: 'opening', name: '立论', speeches: [] }]
    },
    werewolf: {
      type: 'werewolf',
      id: 'werewolf-import-demo',
      players: [{ id: 1, nickname: '玩家A', role: 'werewolf', camp: 'werewolf' }],
      rounds: [{ number: 1, title: '第1天', speeches: [] }]
    },
    consensus: {
      type: 'consensus',
      id: 'consensus-import-demo',
      event: { id: 'skin-demo', name: '皮肤名称' },
      players: [{ id: 1, nickname: '玩家A', role: 'investigator' }],
      rounds: [{ number: 1, title: '第1轮', speeches: [] }]
    }
  };
  return templates[normalizeGameType(gameType)];
}

function normalizeGameType(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('debate')) return 'debate';
  if (text.includes('werewolf')) return 'werewolf';
  return 'consensus';
}

function getGameTypeName(gameType) {
  if (gameType === 'debate') return 'AI 辩论赛';
  if (gameType === 'werewolf') return 'AI 狼人杀';
  return '共识迷雾';
}

function slugifyId(text) {
  const slug = String(text || 'skin').toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
  return `skin-${slug || Date.now()}`;
}

module.exports = {
  createPlayer,
  createModel,
  createVoicePackage,
  createSkin,
  deleteModel,
  deleteGame,
  deletePlayer,
  deleteSkin,
  deleteVoicePackage,
  deleteWerewolfMode,
  deleteWerewolfRole,
  getAdminStats,
  getAppSettings,
  getGame,
  getModel,
  getPlayer,
  getRuntimeModel,
  getRandomEnabledSkin,
  getSkin,
  getVoicePackage,
  getWerewolfMode,
  getWerewolfRole,
  importMarkdownSkins,
  importSkinJson,
  importGameRecord,
  initAdminData,
  listGames,
  listModels,
  listPlayers,
  listSkins,
  listVoicePackages,
  listWerewolfModes,
  listWerewolfRoles,
  reorderPlayers,
  saveGameRecord,
  setPlayerEnabled,
  setDefaultHostPlayerId,
  setSkinEnabled,
  updateModel,
  updatePlayer,
  updateSkin,
  updateVoicePackage,
  upsertWerewolfMode,
  upsertWerewolfRole
};
