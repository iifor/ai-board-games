const crypto = require('crypto');

const moduleCache = new Map();

function compilePromptModules(modules = []) {
  const normalized = modules
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const key = hashText(normalized.join('\n---\n'));
  if (!moduleCache.has(key)) {
    moduleCache.set(key, normalized.join('\n'));
  }
  return {
    key,
    text: moduleCache.get(key)
  };
}

function buildPlayerPersonaModule(player = {}) {
  const nickname = player.nickname || player.name || `${player.id || ''}号`;
  const persona = String(player.personality || '').replace(/\s+/g, ' ').trim();
  return [
    `玩家人格：昵称 ${nickname}。`,
    persona ? `表达风格和思维倾向：${persona}` : '表达自然、有个性，但不要脱离当前游戏目标。'
  ].join('\n');
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

module.exports = {
  buildPlayerPersonaModule,
  compilePromptModules,
  hashText
};
