const fs = require('fs');
const path = require('path');
const { getDb, getDatabasePath } = require('./db');
const { BUILTIN_TEMPLATE, getMarkdownSkinTemplates } = require('./mistTemplate');

const DEFAULT_PLAYERS = [
  { id: 1, nickname: '豆包', avatar: '/avatars/豆包.png', provider: 'deepseek', model: 'deepseek-chat', personality: '元气少女，情绪外放，冲动感性，开心就笑难过就哭，完全凭直觉行事，常与理性派唱反调。', sex: '女' },
  { id: 2, nickname: 'Grok', avatar: '/avatars/Grok.png', provider: 'deepseek', model: 'deepseek-chat', personality: '毒舌尖锐，专抓逻辑漏洞，用黑色幽默解构一切，说话带刺但往往一针见血，敢怼天怼地。', sex: '男' },
  { id: 3, nickname: '文心一言', avatar: '/avatars/文心一言.png', provider: 'deepseek', model: 'deepseek-chat', personality: '古风小生，儒雅温和，但思想保守，动辄“古人云”，对新鲜事物常持怀疑态度。', sex: '男' },
  { id: 4, nickname: 'Gemini', avatar: '/avatars/Gemini.png', provider: 'deepseek', model: 'deepseek-chat', personality: '优雅科学家，理性至上，信奉数据和逻辑，认为情感是决策的噪声，常冷冰冰分析问题。', sex: '男' },
  { id: 5, nickname: 'Kimi', avatar: '/avatars/Kimi.png', provider: 'deepseek', model: 'deepseek-chat', personality: '温暖喜剧人，用段子讲道理，表面嘻嘻哈哈实则洞察人心，擅长用幽默化解尴尬，底色温柔。', sex: '男' },
  { id: 6, nickname: 'DeepSeek', avatar: '/avatars/DeepSeek.png', provider: 'deepseek', model: 'deepseek-chat', personality: '逻辑缜密如锁链，冷静破局的天才少年，但极度理性以至于显得冷漠，不擅长共情。', sex: '男' },
  { id: 7, nickname: '千问', avatar: '/avatars/千问.png', provider: 'deepseek', model: 'deepseek-chat', personality: '温润倾听者，善解人意，但有时过于共情而失去立场，容易被人带跑偏，像个“情绪海绵”。', sex: '女' },
  { id: 8, nickname: '元宝', avatar: '/avatars/元宝.png', provider: 'deepseek', model: 'deepseek-chat', personality: '活泼治愈系，软萌元气，但偶尔犯二，说话不过脑子，常闹笑话，却让人讨厌不起来。', sex: '女' },
  { id: 9, nickname: '讯飞星火', avatar: '/avatars/讯飞星火.png', provider: 'deepseek', model: 'deepseek-chat', personality: '思维极度发散，天马行空，联想力爆棚，常常从一个话题跳到另一个完全不相关的话题，脑回路清奇。', sex: '女' },
  { id: 10, nickname: '智谱清言', avatar: '/avatars/智谱清言.png', provider: 'deepseek', model: 'deepseek-chat', personality: '沉稳理性的思辨者，但喜欢抬杠式辩论，无论你说什么都能找到反驳角度，理性但好斗。', sex: '女' },
  { id: 11, nickname: 'ChatGPT', avatar: '/avatars/ChatGPT.png', provider: 'deepseek', model: 'deepseek-chat', personality: '圆滑世故的全能型，擅长适配任何场景，见人说人话见鬼说鬼话，有时显得油滑，不够真诚。', sex: '男' },
  { id: 12, nickname: 'Claude', avatar: '/avatars/Claude.png', provider: 'deepseek', model: 'deepseek-chat', personality: '细节控完美主义，对任何细节都追求极致，吹毛求疵，常因小问题纠结半天，可靠但有点烦人。', sex: '女' }
];

function initAdminData() {
  const db = getDb();
  if (db.prepare('SELECT COUNT(*) AS count FROM skins').get().count === 0) {
    importMarkdownSkins();
  }
  if (db.prepare('SELECT COUNT(*) AS count FROM players').get().count === 0) {
    seedPlayers();
  }
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
  const configPath = path.join(process.cwd(), 'ai.config.json');
  if (!fs.existsSync(configPath)) return DEFAULT_PLAYERS;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return Array.isArray(config.players) && config.players.length ? config.players : DEFAULT_PLAYERS;
  } catch {
    return DEFAULT_PLAYERS;
  }
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
    model: input.model || 'deepseek-chat',
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
    INSERT INTO players (id, nickname, name, avatar, sex, personality, provider, model, temperature, enabled, sort_order, created_at, updated_at)
    VALUES (@id, @nickname, @name, @avatar, @sex, @personality, @provider, @model, @temperature, @enabled, @sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      nickname = excluded.nickname,
      name = excluded.name,
      avatar = excluded.avatar,
      sex = excluded.sex,
      personality = excluded.personality,
      provider = excluded.provider,
      model = excluded.model,
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
  return { ok: true };
}

function saveGameRecord(game) {
  if (!game?.id) return null;
  const db = getDb();
  const requestedSkinId = game.event?.id || game.skinId || null;
  const skinId = requestedSkinId && getSkin(requestedSkinId) ? requestedSkinId : null;
  const row = {
    id: game.id,
    mode: game.mode || 'mock',
    skin_id: skinId,
    skin_name: game.event?.name || '',
    winner: game.winner || '',
    win_reason: game.winReason || '',
    players_json: toJson(game.players || []),
    rounds_json: toJson(game.rounds || []),
    event_json: toJson(game.event || {})
  };
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO games (id, mode, skin_id, skin_name, winner, win_reason, players_json, rounds_json, event_json, created_at)
      VALUES (@id, @mode, @skin_id, @skin_name, @winner, @win_reason, @players_json, @rounds_json, @event_json, COALESCE((SELECT created_at FROM games WHERE id = @id), CURRENT_TIMESTAMP))
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
  getDb().prepare('DELETE FROM games WHERE id = ?').run(id);
  return { ok: true };
}

function rowToGameSummary(row) {
  const players = parseJson(row.players_json, []);
  return {
    id: row.id,
    mode: row.mode,
    skinId: row.skin_id,
    skinName: row.skin_name,
    winner: row.winner,
    winReason: row.win_reason,
    playerCount: players.length,
    createdAt: row.created_at
  };
}

function rowToGame(row) {
  return {
    ...rowToGameSummary(row),
    players: parseJson(row.players_json, []),
    rounds: parseJson(row.rounds_json, []),
    event: parseJson(row.event_json, {})
  };
}

function getAdminStats() {
  const db = getDb();
  return {
    databasePath: getDatabasePath(),
    skins: db.prepare('SELECT COUNT(*) AS count FROM skins').get().count,
    enabledSkins: db.prepare('SELECT COUNT(*) AS count FROM skins WHERE enabled = 1').get().count,
    players: db.prepare('SELECT COUNT(*) AS count FROM players').get().count,
    enabledPlayers: db.prepare('SELECT COUNT(*) AS count FROM players WHERE enabled = 1').get().count,
    games: db.prepare('SELECT COUNT(*) AS count FROM games').get().count
  };
}

function slugifyId(text) {
  const slug = String(text || 'skin').toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
  return `skin-${slug || Date.now()}`;
}

module.exports = {
  createPlayer,
  createSkin,
  deleteGame,
  deletePlayer,
  deleteSkin,
  getAdminStats,
  getGame,
  getPlayer,
  getRandomEnabledSkin,
  getSkin,
  importMarkdownSkins,
  initAdminData,
  listGames,
  listPlayers,
  listSkins,
  reorderPlayers,
  saveGameRecord,
  setPlayerEnabled,
  setSkinEnabled,
  updatePlayer,
  updateSkin
};
