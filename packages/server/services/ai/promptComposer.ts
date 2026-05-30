import * as crypto from 'crypto';

interface Player {
  id?: string | number;
  nickname?: string;
  name?: string;
  personality?: string;
}

interface CompiledPrompt {
  key: string;
  text: string | undefined;
}

const moduleCache = new Map<string, string>();

function compilePromptModules(modules: string[] = []): CompiledPrompt {
  const normalized = modules
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const key = hashText(normalized.join('\n---\n'));
  if (!moduleCache.has(key)) {
    moduleCache.set(key, normalized.join('\n'));
  }
  return {
    key,
    text: moduleCache.get(key),
  };
}

function buildPlayerPersonaModule(player: Player = {}): string {
  const nickname =
    player.nickname || player.name || `${player.id || ''}号`;
  const persona = String(player.personality || '')
    .replace(/\s+/g, ' ')
    .trim();
  return [
    `昵称 ${nickname}。`,
    persona
      ? `表达风格和思维倾向：${persona}`
      : '表达自然、有个性，但不要脱离当前游戏目标。',
  ].join('\n');
}

function hashText(value: string): string {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
}

export { buildPlayerPersonaModule, compilePromptModules, hashText };
