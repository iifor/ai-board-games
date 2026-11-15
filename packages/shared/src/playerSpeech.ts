export interface PlayerSpeechSettings {
  readonly temperature: number;
  readonly maxTokens: number;
  readonly speechMaxChars: number;
}

export type PlayerSpeechOverrides = { readonly [K in keyof PlayerSpeechSettings]?: number | null | undefined };

/** 人设关键词只用于提供可覆盖的建议。表达长短与采样温度分别判断。 */
export function playerSpeechSettings(persona: string, overrides: PlayerSpeechOverrides = {}): PlayerSpeechSettings {
  const talkative = /话痨|健谈|滔滔不绝|喋喋不休|侃侃而谈|长篇大论|能说会道|口若悬河|talkative|verbose/i.test(persona);
  const terse = /高冷|冷峻|寡言|惜字如金|言简意赅|一针见血|沉默|少言|话少|简短|简洁|terse|taciturn/i.test(persona);
  const reserved = /高冷|冷静|冷峻|谨慎|严谨|理性|克制|稳健|沉稳|内敛|安静|温润|逻辑|cautious|analytical/i.test(persona);
  const lively = /话痨|健谈|活泼|外向|热情|热烈|热血|元气|叛逆|野性|跳脱|冲动|幽默|即兴|奔放|outgoing|expressive/i.test(persona);
  return {
    temperature: overrides.temperature ?? (reserved ? 0.6 : lively ? 0.95 : 0.75),
    maxTokens: overrides.maxTokens ?? (talkative ? 8192 : terse ? 3072 : 6144),
    speechMaxChars: overrides.speechMaxChars ?? (talkative ? 500 : terse ? 80 : 250),
  };
}
