/**
 * basic-tracking.js — Track costs for a simple LLM application
 *
 * Demonstrates: creating a tracker, logging calls, viewing stats and breakdowns.
 *
 * Run: node examples/basic-tracking.js
 */

import { createCostTracker } from '../src/index.js';

// ─── Create tracker ───────────────────────────────────────────────────────────
const tracker = createCostTracker({
  storagePath: './example-costs.json',
});

console.log('💰 LLM Cost Tracker — Basic Usage\n');

// ─── Simulate some LLM API calls ──────────────────────────────────────────────

// Xiaomi MiMo calls
tracker.log({
  provider: 'xiaomi',
  model: 'mimo-v2.5',
  inputTokens: 1200,
  outputTokens: 450,
  prompt: 'Summarize the key features of this product for a marketing email.',
  metadata: { userId: 'user-1', session: 'marketing' },
});

tracker.log({
  provider: 'xiaomi',
  model: 'mimo-v2.5',
  inputTokens: 800,
  outputTokens: 300,
  prompt: 'Translate this paragraph to Spanish.',
  metadata: { userId: 'user-1', session: 'translation' },
});

// ⚠️ Thinking model call — uses ~10x more tokens for the same task!
tracker.log({
  provider: 'xiaomi',
  model: 'mimo-v2.5-pro',
  inputTokens: 1200,
  outputTokens: 4500, // Much higher due to thinking tokens
  prompt: 'Summarize the key features of this product for a marketing email.',
  metadata: { userId: 'user-1', session: 'marketing', note: 'Used thinking model by mistake' },
});

// OpenAI calls
tracker.log({
  provider: 'openai',
  model: 'gpt-4o-mini',
  inputTokens: 2000,
  outputTokens: 800,
  prompt: 'Generate a JSON schema for a user profile API.',
  metadata: { userId: 'user-2', session: 'codegen' },
});

// DeepSeek calls
tracker.log({
  provider: 'deepseek',
  model: 'deepseek-chat',
  inputTokens: 3000,
  outputTokens: 1200,
  prompt: 'Explain the difference between REST and GraphQL in simple terms.',
  metadata: { userId: 'user-3', session: 'education' },
});

// Anthropic calls
tracker.log({
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
  inputTokens: 1500,
  outputTokens: 600,
  prompt: 'Review this code for security vulnerabilities.',
  metadata: { userId: 'user-2', session: 'security-audit' },
});

// ─── View Results ─────────────────────────────────────────────────────────────

console.log('📊 Overall Statistics (all time):');
const stats = tracker.getStats();
console.log(JSON.stringify(stats, null, 2));

console.log('\n🤖 Cost by Model:');
const byModel = tracker.getCostByModel();
for (const m of byModel) {
  console.log(`  ${m.model}: $${m.cost.toFixed(6)} (${m.calls} calls, ${m.percentage.toFixed(1)}%)`);
}

console.log('\n🏢 Cost by Provider:');
const byProvider = tracker.getCostByProvider();
for (const p of byProvider) {
  console.log(`  ${p.provider}: $${p.cost.toFixed(6)} (${p.calls} calls, ${p.percentage.toFixed(1)}%)`);
}

console.log('\n💡 Optimization Suggestions:');
const suggestions = tracker.suggestSavings();
for (const s of suggestions) {
  console.log(`\n  [${s.type}] Estimated savings: $${s.estimatedSavings.toFixed(4)}`);
  console.log(`  ${s.description}`);
}

console.log('\n✅ Done! Check example-costs.json for persisted data.');
