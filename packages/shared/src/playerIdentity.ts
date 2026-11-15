/** Built-in artwork identifiers shared by the roster, stage and legacy imports. */
const PORTRAITS: Readonly<Record<string, string>> = {
  doubao: 'doubao', 豆包: 'doubao', grok: 'grok', wenxin: 'wenxin', 文心: 'wenxin', 文心一言: 'wenxin',
  gemini: 'gemini', kimi: 'kimi', deepseek: 'deepseek', qwen: 'qwen', qianwen: 'qwen', 千问: 'qwen', 通义: 'qwen', 通义千问: 'qwen',
  yuanbao: 'yuanbao', 元宝: 'yuanbao', 腾讯元宝: 'yuanbao', xinghuo: 'xinghuo', spark: 'xinghuo', 星火: 'xinghuo', 讯飞星火: 'xinghuo',
  zhipu: 'zhipu', chatglm: 'zhipu', 智谱: 'zhipu', 智谱清言: 'zhipu', chatgpt: 'chatgpt',
  claude: 'claude-code', claudecode: 'claude-code', meta: 'meta', metaai: 'meta',
};

export function playerPortraitKey(name: string): string | null {
  const alias = name.normalize('NFKC').trim().toLowerCase().replace(/[\s._\-·]/g, '');
  return Object.hasOwn(PORTRAITS, alias) ? PORTRAITS[alias]! : null;
}

/** 保留模型管理中的显示名。自动导入的 GPT 标识可缩写，完整标识留在资料卡。 */
export function modelDisplayName(name: string, model: string): string {
  if (name !== model || !/^gpt-\d/i.test(model)) return name;
  return 'GPT-' + model.slice(4).replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/-/g, ' ');
}
