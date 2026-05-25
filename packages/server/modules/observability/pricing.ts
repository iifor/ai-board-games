// ── Types ────────────────────────────────────────────────────────────

interface PricingTier {
  input: number;
  output: number;
}

interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
}

interface UsageData {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

// ── Model pricing per million tokens (USD) ───────────────────────────
// Prices as of 2026-05. Update as providers change pricing.

const MODEL_PRICING: Record<string, PricingTier> = {
  // DeepSeek
  'deepseek-chat':           { input: 0.14, output: 0.28 },
  'deepseek-reasoner':       { input: 0.55, output: 2.19 },
  // OpenAI
  'gpt-4o':                  { input: 2.50, output: 10.00 },
  'gpt-4o-mini':             { input: 0.15, output: 0.60 },
  'gpt-4.1':                 { input: 2.00, output: 8.00 },
  'gpt-4.1-mini':            { input: 0.40, output: 1.60 },
  'gpt-4.1-nano':            { input: 0.10, output: 0.40 },
  'o4-mini':                 { input: 1.10, output: 4.40 },
  'o3':                      { input: 10.00, output: 40.00 },
  // Anthropic
  'claude-sonnet-4-6':       { input: 3.00, output: 15.00 },
  'claude-haiku-4-5':        { input: 0.80, output: 4.00 },
  'claude-opus-4-7':         { input: 15.00, output: 75.00 },
  // Qwen
  'qwen-turbo':              { input: 0.30, output: 0.60 },
  'qwen-plus':               { input: 0.80, output: 2.00 },
  'qwen-max':                { input: 2.40, output: 9.60 },
  // Google
  'gemini-2.5-flash':        { input: 0.15, output: 0.60 },
  'gemini-2.5-pro':          { input: 1.25, output: 10.00 },
} as const;

// ── Functions ────────────────────────────────────────────────────────

function findPricingTier(model: string | null | undefined): PricingTier | null {
  if (!model) return null;
  const key = String(model).toLowerCase();
  if (MODEL_PRICING[key]) return MODEL_PRICING[key];
  // Fuzzy match: find pricing whose key is a prefix of the model
  for (const [k, v] of Object.entries(MODEL_PRICING)) {
    if (key.startsWith(k) || key.includes(k)) return v;
  }
  return null;
}

function calcCost(model: string, promptTokens: number, completionTokens: number): number | null {
  const tier = findPricingTier(model);
  if (!tier) return null;
  return (promptTokens / 1_000_000) * tier.input + (completionTokens / 1_000_000) * tier.output;
}

function extractTokenUsage(data: UsageData | null | undefined, apiFormat: string): TokenUsage {
  if (!data || !data.usage) return { promptTokens: null, completionTokens: null };
  const usage = data.usage;
  if (apiFormat === 'anthropic-compatible') {
    return {
      promptTokens: usage.input_tokens ?? null,
      completionTokens: usage.output_tokens ?? null,
    };
  }
  return {
    promptTokens: usage.prompt_tokens ?? null,
    completionTokens: usage.completion_tokens ?? null,
  };
}

export type { PricingTier, TokenUsage, UsageData };
export { MODEL_PRICING, findPricingTier, calcCost, extractTokenUsage };
