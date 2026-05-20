/**
 * budget-alert.js — Budget monitoring with automatic alerts
 *
 * Demonstrates: setting budgets, monitoring spend, projecting end-of-month cost,
 * and receiving alerts when approaching the limit.
 *
 * Run: node examples/budget-alert.js
 */

import { createCostTracker } from '../src/index.js';

console.log('🔔 LLM Cost Tracker — Budget Alerts Demo\n');

// ─── Create tracker with budget ───────────────────────────────────────────────
const tracker = createCostTracker({
  storagePath: './budget-costs.json',
  budget: { amount: 5.00, period: 'monthly' }, // $5/month budget
  alertThreshold: 0.75, // Alert at 75% consumption
  onAlert: (message, status) => {
    console.log('\n🚨 BUDGET ALERT TRIGGERED:');
    console.log(message);
    console.log(`   Status: ${JSON.stringify(status, null, 2)}\n`);
  },
});

// ─── Simulate spending ────────────────────────────────────────────────────────

console.log('Simulating LLM API calls...\n');

const calls = [
  // Normal calls
  { provider: 'xiaomi', model: 'mimo-v2.5', inputTokens: 1000, outputTokens: 500, prompt: 'Generate a summary' },
  { provider: 'xiaomi', model: 'mimo-v2.5', inputTokens: 800, outputTokens: 400, prompt: 'Translate to French' },
  { provider: 'openai', model: 'gpt-4o-mini', inputTokens: 1500, outputTokens: 600, prompt: 'Code review' },

  // Expensive calls that will trigger budget alert
  { provider: 'openai', model: 'gpt-4o', inputTokens: 50000, outputTokens: 20000, prompt: 'Complex analysis task' },
  { provider: 'anthropic', model: 'claude-3-opus-20240229', inputTokens: 30000, outputTokens: 15000, prompt: 'Deep reasoning task' },
  { provider: 'xiaomi', model: 'mimo-v2.5-pro', inputTokens: 10000, outputTokens: 8000, prompt: 'Thinking model task' },
];

for (const call of calls) {
  const entry = tracker.log(call);
  console.log(`  Logged: ${call.provider}/${call.model} — ${call.inputTokens + call.outputTokens} tokens — $${entry.cost.toFixed(6)}`);

  // Check budget after each call
  const status = tracker.checkBudget();
  console.log(`  Budget: ${status.percentage.toFixed(1)}% used ($${status.spent.toFixed(4)}/$${status.budget})`);

  if (status.percentage > 100) {
    console.log('  🚨 OVER BUDGET!');
  } else if (status.percentage > 75) {
    console.log('  ⚠️  Approaching budget limit');
  }
  console.log();
}

// ─── Budget Summary ───────────────────────────────────────────────────────────

console.log('─'.repeat(60));
console.log('📊 Final Budget Summary:');
console.log(tracker.budgetManager.getSummary());

console.log('\n📈 Projected end-of-month spend:');
const projected = tracker.budgetManager.projectSpend();
console.log(`  $${projected.toFixed(4)}`);

if (projected > 5) {
  console.log(`  ⚠️  On track to exceed $5.00 budget by $${(projected - 5).toFixed(4)}`);
  console.log('  💡 Consider switching to cheaper models or reducing max_tokens');
}

// ─── Show optimization suggestions ────────────────────────────────────────────

console.log('\n💡 Optimization Suggestions:');
const suggestions = tracker.suggestSavings();
for (const s of suggestions) {
  const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[s.priority] || '⚪';
  console.log(`\n  ${emoji} [${s.type}] $${s.estimatedSavings.toFixed(4)} savings`);
  console.log(`  ${s.description}`);
}

console.log('\n✅ Done! Check budget-costs.json for persisted data.');
