/**
 * llm-cost-tracker — Provider Pricing Data
 *
 * Contains per-1M-token pricing for major LLM providers.
 * Prices in USD per 1 million tokens (input and output priced separately).
 *
 * ⚠️  REAL-WORLD PITFALL (from production):
 * Thinking models (e.g. mimo-v2.5-pro) use ~10x more tokens than non-thinking
 * (e.g. mimo-v2.5) for the same task — discovered after a $200 surprise bill.
 * Always compare thinking vs non-thinking on a cost-per-quality basis.
 *
 * ⚠️  Provider pricing changes silently. Pin pricing overrides in production config
 * and review quarterly.
 */

// ─── Built-in pricing (USD per 1M tokens) ────────────────────────────────────
// Each provider has models with { input, output } pricing.
export const PROVIDERS = {
  xiaomi: {
    name: 'Xiaomi MiMo',
    models: {
      'mimo-v2.5': { input: 0.10, output: 0.30, description: 'Non-thinking — fast, cheap, good for simple tasks' },
      'mimo-v2.5-pro': { input: 0.60, output: 1.80, description: 'Thinking model — ~10x more tokens for same task. Use for complex reasoning only.' },
      'mimo-v2.5-flash': { input: 0.05, output: 0.15, description: 'Ultra-fast, lowest cost' },
    },
  },
  openrouter: {
    name: 'OpenRouter',
    models: {
      'openrouter/auto': { input: 0.00, output: 0.00, description: 'Auto-routed — pricing varies by chosen model' },
      'meta-llama/llama-3.1-405b-instruct': { input: 2.00, output: 2.00 },
      'meta-llama/llama-3.1-70b-instruct': { input: 0.52, output: 0.75 },
      'google/gemini-2.0-flash-001': { input: 0.10, output: 0.40 },
      'mistralai/mistral-large': { input: 2.00, output: 6.00 },
    },
  },
  deepseek: {
    name: 'DeepSeek',
    models: {
      'deepseek-chat': { input: 0.14, output: 0.28, description: 'DeepSeek V3 — general purpose' },
      'deepseek-reasoner': { input: 0.55, output: 2.19, description: 'DeepSeek R1 — thinking model with hidden reasoning tokens billed at output rate' },
    },
  },
  minimax: {
    name: 'MiniMax',
    models: {
      'MiniMax-Text-01': { input: 0.20, output: 1.00 },
      'abab6.5s-chat': { input: 0.10, output: 0.50 },
    },
  },
  opencode: {
    name: 'OpenCode',
    models: {
      'opencode-1': { input: 0.00, output: 0.00, description: 'Free tier — rate limited' },
      'opencode-1-pro': { input: 1.00, output: 3.00 },
    },
  },
  openai: {
    name: 'OpenAI',
    models: {
      'gpt-4o': { input: 2.50, output: 10.00 },
      'gpt-4o-mini': { input: 0.15, output: 0.60 },
      'gpt-4-turbo': { input: 10.00, output: 30.00 },
      'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
      'o1': { input: 15.00, output: 60.00, description: 'Thinking model — output includes hidden reasoning tokens' },
      'o1-mini': { input: 3.00, output: 12.00, description: 'Thinking model — cheaper reasoning' },
      'o3-mini': { input: 1.10, output: 4.40, description: 'Thinking model' },
    },
  },
  anthropic: {
    name: 'Anthropic',
    models: {
      'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
      'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
      'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
      'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
    },
  },
  google: {
    name: 'Google Gemini',
    models: {
      'gemini-2.5-pro': { input: 1.25, output: 10.00, description: 'Thinking model — strong reasoning, complex tasks' },
      'gemini-2.5-flash': { input: 0.15, output: 0.60, description: 'Fast, cost-effective, good for most tasks' },
      'gemini-2.0-flash': { input: 0.10, output: 0.40, description: 'Previous gen, still widely used' },
      'gemini-2.0-flash-lite': { input: 0.075, output: 0.30, description: 'Lightest, cheapest Gemini model' },
    },
  },
};

// ─── Thinking / non-thinking model pairs ──────────────────────────────────────
// Used by optimizer to suggest cheaper alternatives.
export const THINKING_MODEL_PAIRS = [
  { thinking: 'mimo-v2.5-pro', nonThinking: 'mimo-v2.5', provider: 'xiaomi' },
  { thinking: 'deepseek-reasoner', nonThinking: 'deepseek-chat', provider: 'deepseek' },
  { thinking: 'o1', nonThinking: 'gpt-4o', provider: 'openai' },
  { thinking: 'o1-mini', nonThinking: 'gpt-4o-mini', provider: 'openai' },
  { thinking: 'o3-mini', nonThinking: 'gpt-4o-mini', provider: 'openai' },
  { thinking: 'gemini-2.5-pro', nonThinking: 'gemini-2.5-flash', provider: 'google' },
];

// Mutable custom pricing overrides (applied via updatePricing)
const customPricing = new Map();

/**
 * Look up pricing for a specific model.
 *
 * @param {string} provider - Provider name (lowercase)
 * @param {string} model    - Model identifier
 * @returns {{ input: number, output: number } | null} Price per 1M tokens, or null if unknown
 */
export function getProviderPricing(provider, model) {
  // Check custom overrides first
  const key = `${provider}/${model}`;
  if (customPricing.has(key)) {
    return customPricing.get(key);
  }

  const p = PROVIDERS[provider?.toLowerCase()];
  if (!p) return null;
  return p.models[model] || null;
}

/**
 * Calculate the cost of an LLM API call.
 *
 * @param {string} provider     - Provider name
 * @param {string} model        - Model identifier
 * @param {number} inputTokens  - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @returns {number} Cost in USD
 * @throws {Error} If provider/model is not found and no custom pricing is set
 */
export function calculateCost(provider, model, inputTokens, outputTokens) {
  const pricing = getProviderPricing(provider, model);
  if (!pricing) {
    throw new Error(
      `Unknown pricing for ${provider}/${model}. ` +
      `Use updatePricing('${provider}', { '${model}': { input: X, output: Y } }) to add custom pricing.`
    );
  }

  // Pricing is per 1M tokens
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Update or add custom pricing for a provider/model.
 *
 * @param {string} provider  - Provider name
 * @param {Object} models    - { modelName: { input: pricePer1M, output: pricePer1M } }
 *
 * @example
 *   updatePricing('xiaomi', { 'mimo-v2.5-pro': { input: 0.5, output: 1.5 } });
 */
export function updatePricing(provider, models) {
  for (const [model, pricing] of Object.entries(models)) {
    const key = `${provider}/${model}`;
    customPricing.set(key, { input: pricing.input, output: pricing.output });

    // Also update the built-in PROVIDERS object for consistency
    if (!PROVIDERS[provider]) {
      PROVIDERS[provider] = { name: provider, models: {} };
    }
    PROVIDERS[provider].models[model] = { ...pricing };
  }
}

/**
 * Get all known provider/model combinations and their pricing.
 *
 * @returns {Object} Full pricing table
 */
export function getAllPricing() {
  return { ...PROVIDERS };
}
