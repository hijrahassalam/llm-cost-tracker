# 💰 LLM Cost Tracker

**Track, Analyze, and Optimize your LLM spending across multiple providers.**

[![npm](https://img.shields.io/npm/v/llm-cost-tracker?color=blue)](https://www.npmjs.com/package/llm-cost-tracker)
[![license](https://img.shields.io/npm/l/llm-cost-tracker?color=green)](LICENSE)
[![node](https://img.shields.io/node/v/llm-cost-tracker)](package.json)
[![zero deps](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

A CLI + library for logging, analyzing, and optimizing LLM API costs. Zero dependencies. Works with any OpenAI-compatible provider.

---

## ⚠️ Real-World Pitfall

> **Thinking models cost 10x more than you think.**
>
> A thinking model (e.g. `mimo-v2.5-pro`) uses ~10x more tokens than its non-thinking counterpart (`mimo-v2.5`) for the same task — discovered after a **$200 surprise bill**. Always compare thinking vs non-thinking on a **cost-per-quality** basis, not just per-call cost.

---

## ✨ Features

- **Multi-provider pricing** — Built-in rates for Xiaomi MiMo, OpenRouter, DeepSeek, MiniMax, OpenCode, OpenAI, Anthropic
- **Cost analysis** — Stats, breakdowns by model/provider, trend charts, anomaly detection
- **Optimization suggestions** — Thinking vs non-thinking comparison, model switching, caching, batching
- **Budget alerts** — Set spending limits, get notified at configurable thresholds, project end-of-period spend
- **Middleware** — Auto-track LLM API calls via Express middleware or fetch() interceptor
- **CLI** — Full command-line interface for quick cost queries
- **Zero dependencies** — Uses only Node.js built-ins (`node:crypto`, `node:fs`, `node:util`)
- **ESM throughout** — Modern `import/export` module system

---

## 🚀 Quick Start

### 1. Install

```bash
npm install llm-cost-tracker
```

### 2. Track Costs

```javascript
import { createCostTracker } from 'llm-cost-tracker';

const tracker = createCostTracker({
  storagePath: './cost-data.json',
  budget: { amount: 50, period: 'monthly' },
  alertThreshold: 0.8,
});

// Log an LLM API call
tracker.log({
  provider: 'xiaomi',
  model: 'mimo-v2.5',
  inputTokens: 1200,
  outputTokens: 450,
  prompt: 'Summarize this article for a newsletter.',
});

// View stats
console.log(tracker.getStats('7d'));
console.log(tracker.getCostByModel());
console.log(tracker.suggestSavings());
```

### 3. CLI

```bash
# Log a call
llm-cost log --provider xiaomi --model mimo-v2.5 --input 500 --output 200

# View statistics
llm-cost stats --period 7d

# Get optimization suggestions
llm-cost suggest
```

---

## 📖 CLI Reference

| Command | Description | Example |
|---------|-------------|---------|
| `log` | Log an LLM API call | `llm-cost log -p xiaomi -m mimo-v2.5 -i 500 -o 200` |
| `stats` | Show cost statistics | `llm-cost stats --period 7d` |
| `models` | Cost breakdown by model | `llm-cost models` |
| `providers` | Cost breakdown by provider | `llm-cost providers` |
| `expensive` | Most expensive prompts | `llm-cost expensive --top 10` |
| `trend` | Daily cost trend | `llm-cost trend --days 30` |
| `anomalies` | Detect cost spikes | `llm-cost anomalies` |
| `suggest` | Optimization suggestions | `llm-cost suggest` |
| `budget` | Set/check budget | `llm-cost budget --set 50 --period monthly` |
| `export` | Export data | `llm-cost export --format csv` |
| `clear` | Delete all data | `llm-cost clear` |

### Options

- `-p, --provider` — Provider name
- `-m, --model` — Model identifier
- `-i, --input` — Input token count
- `-o, --output` — Output token count
- `--period` — Time window: `24h`, `7d`, `30d`, `all`; or budget: `daily`, `weekly`, `monthly`
- `--days` — Number of days for trend
- `-t, --top` — Number of results
- `--set` — Set budget amount
- `-f, --format` — Export format: `json`, `csv`
- `-s, --storage` — Path to cost data file

---

## 📚 API Reference

### `createCostTracker(config)`

Creates a fully-wired cost tracker instance.

**Config options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `providers` | `Object` | `{}` | Custom pricing overrides per provider |
| `budget` | `{ amount, period }` | `null` | Budget configuration |
| `alertThreshold` | `number` | `0.8` | Alert when this fraction of budget is consumed |
| `storagePath` | `string` | `null` | Path to persist cost data as JSON |
| `onAlert` | `Function` | `console.warn` | Custom alert callback |

**Returns:**

| Method | Description |
|--------|-------------|
| `log(entry)` | Log an LLM API call |
| `getStats(period?)` | Aggregated cost statistics |
| `getCostByModel()` | Cost breakdown by model |
| `getCostByProvider()` | Cost breakdown by provider |
| `getExpensivePrompts(topN?)` | Most expensive prompt groups |
| `suggestSavings()` | Optimization suggestions |
| `export(format?)` | Export data as `json` or `csv` |
| `getTrend(days?)` | Daily cost trend for charting |
| `detectAnomalies()` | Detect cost spikes |
| `checkBudget()` | Current budget status |
| `getEntries(filters?)` | Raw filtered entries |

### `costMiddleware(options)` — Express Middleware

```javascript
import { costMiddleware } from 'llm-cost-tracker/middleware';

app.use(costMiddleware({
  tracker,
  provider: 'xiaomi',
}));
```

### `createFetchInterceptor(options)` — Fetch Wrapper

```javascript
import { createFetchInterceptor } from 'llm-cost-tracker/middleware';

globalThis.fetch = createFetchInterceptor({
  tracker,
  provider: 'openai',
});
```

### `calculateCost(provider, model, inputTokens, outputTokens)`

Calculate cost for a specific call. Returns USD.

```javascript
import { calculateCost } from 'llm-cost-tracker/pricing';

const cost = calculateCost('xiaomi', 'mimo-v2.5', 1000, 500);
// → 0.000250
```

### `updatePricing(provider, models)`

Override or add custom pricing.

```javascript
import { updatePricing } from 'llm-cost-tracker/pricing';

updatePricing('custom-provider', {
  'my-model': { input: 0.50, output: 1.50 },
});
```

---

## 💲 Pricing Table

Prices in USD per 1 million tokens.

### Xiaomi MiMo

| Model | Input | Output | Notes |
|-------|-------|--------|-------|
| `mimo-v2.5` | $0.10 | $0.30 | Non-thinking — fast, cheap |
| `mimo-v2.5-pro` | $0.60 | $1.80 | ⚠️ Thinking — ~10x more tokens |
| `mimo-v2.5-flash` | $0.05 | $0.15 | Ultra-fast, lowest cost |

### DeepSeek

| Model | Input | Output | Notes |
|-------|-------|--------|-------|
| `deepseek-chat` | $0.14 | $0.28 | General purpose |
| `deepseek-reasoner` | $0.55 | $2.19 | ⚠️ Thinking — hidden reasoning tokens billed |

### OpenAI

| Model | Input | Output | Notes |
|-------|-------|--------|-------|
| `gpt-4o` | $2.50 | $10.00 | |
| `gpt-4o-mini` | $0.15 | $0.60 | Budget-friendly |
| `gpt-4-turbo` | $10.00 | $30.00 | |
| `o1` | $15.00 | $60.00 | ⚠️ Thinking — includes hidden reasoning |
| `o1-mini` | $3.00 | $12.00 | ⚠️ Thinking |
| `o3-mini` | $1.10 | $4.40 | ⚠️ Thinking |

### Anthropic

| Model | Input | Output |
|-------|-------|--------|
| `claude-3-5-sonnet` | $3.00 | $15.00 |
| `claude-3-5-haiku` | $0.80 | $4.00 |
| `claude-3-opus` | $15.00 | $75.00 |

### OpenRouter, MiniMax, OpenCode

See [`src/pricing.js`](src/pricing.js) for full pricing data.

---

## ⚠️ Pitfalls & Lessons Learned

### 1. Thinking Models Cost 10x More

Thinking/reasoning models (o1, mimo-v2.5-pro, deepseek-reasoner) produce hidden "thinking" tokens that are billed at output rates. For the same task:

- `mimo-v2.5`: ~1,500 total tokens → $0.0006
- `mimo-v2.5-pro`: ~15,000 total tokens → $0.027

**That's a 45x cost difference for the same quality output.**

Always A/B test thinking vs non-thinking models on your specific tasks. Use thinking models only for tasks that genuinely benefit from chain-of-thought reasoning.

### 2. Provider Pricing Changes Silently

Providers update pricing without notice. Pin pricing overrides in your config:

```javascript
const tracker = createCostTracker({
  providers: {
    xiaomi: {
      customPricing: {
        'mimo-v2.5': { input: 0.10, output: 0.30 }, // Pin to known rates
      },
    },
  },
});
```

### 3. Token Counting Varies by Model

Different providers use different tokenizers. A "token" in GPT-4o is not the same as a token in Claude. When comparing costs across providers, normalize by **characters** or **words**, not tokens.

### 4. Streaming Responses Hide True Cost

When using streaming, the full token count is only available when the stream completes. Log costs after the stream ends, not before.

### 5. Caching Saves More Than You Think

Repeated prompts are common in production (RAG systems, chatbots, agent loops). Implementing even simple exact-match caching can reduce costs by 30-50%.

---

## 📄 License

MIT — [Hijrah Assalam](LICENSE)
