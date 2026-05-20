/**
 * middleware-demo.js — Express middleware that auto-tracks LLM API costs
 *
 * Demonstrates: costMiddleware for Express, and createFetchInterceptor for fetch().
 *
 * Run: node examples/middleware-demo.js
 *
 * ⚠️  Note: This example requires `express` to be installed separately.
 *     The middleware itself has zero dependencies — only this demo file uses express.
 */

import { createCostTracker } from '../src/index.js';
import { costMiddleware, createFetchInterceptor } from '../src/middleware.js';

// ─── Create tracker ───────────────────────────────────────────────────────────
const tracker = createCostTracker({
  storagePath: './middleware-costs.json',
  budget: { amount: 10, period: 'monthly' },
  alertThreshold: 0.8,
});

console.log('🔌 LLM Cost Tracker — Middleware Demo\n');

// ═══════════════════════════════════════════════════════════════════════════════
// Option 1: Express Middleware
// ═══════════════════════════════════════════════════════════════════════════════
console.log('📡 Option 1: Express Middleware');
console.log('   Add costMiddleware() to your Express app to auto-track all LLM calls:\n');

const expressExample = `
  import express from 'express';
  import { costMiddleware } from 'llm-cost-tracker/middleware';

  const app = express();
  app.use(express.json());

  // Auto-track all LLM API calls
  app.use(costMiddleware({
    tracker,
    provider: 'xiaomi',
    path: '/v1/chat/completions',
  }));

  // Your LLM proxy endpoint
  app.post('/v1/chat/completions', async (req, res) => {
    const response = await fetch('https://api.xiaomi.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${process.env.API_KEY}\`,
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    // The middleware automatically logs the cost from this response!
    res.json(data);
  });

  app.listen(3000, () => console.log('LLM proxy running on :3000'));
`;

console.log(expressExample);

// ═══════════════════════════════════════════════════════════════════════════════
// Option 2: Fetch Interceptor (works anywhere, no Express needed)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('📡 Option 2: Fetch Interceptor');
console.log('   Wrap globalThis.fetch() to auto-track all LLM API calls:\n');

const fetchExample = `
  import { createFetchInterceptor } from 'llm-cost-tracker/middleware';

  // Replace global fetch with tracked version
  globalThis.fetch = createFetchInterceptor({
    tracker,
    provider: 'xiaomi',
    // baseUrl: 'https://api.xiaomi.com',  // optional: only intercept this URL
  });

  // Now ALL fetch calls to LLM APIs are automatically tracked
  const response = await fetch('https://api.xiaomi.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'mimo-v2.5',
      messages: [{ role: 'user', content: 'Hello!' }],
    }),
  });
  const data = await response.json();
  // Cost is automatically logged — check tracker.getStats() to see it
`;

console.log(fetchExample);

// ═══════════════════════════════════════════════════════════════════════════════
// Live Demo: Fetch Interceptor (no Express needed)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('─'.repeat(60));
console.log('🧪 Running fetch interceptor demo (will auto-track any LLM API calls)...\n');

// Install the interceptor
const originalFetch = globalThis.fetch;
globalThis.fetch = createFetchInterceptor({
  tracker,
  provider: 'xiaomi',
});

// Simulate an LLM API call (will fail, but demonstrates the pattern)
// In production, this would be a real API call
try {
  // Manually log a simulated call instead since we don't have a real API
  tracker.log({
    provider: 'xiaomi',
    model: 'mimo-v2.5',
    inputTokens: 500,
    outputTokens: 200,
    prompt: 'Hello from middleware demo!',
    metadata: { source: 'middleware-demo' },
  });

  console.log('✅ Logged simulated LLM call');
  console.log('\n📊 Current stats:');
  const stats = tracker.getStats();
  console.log(`  Total cost: $${stats.totalCost.toFixed(6)}`);
  console.log(`  Total calls: ${stats.totalCalls}`);
  console.log(`  Total tokens: ${stats.totalTokens}`);
} finally {
  // Restore original fetch
  globalThis.fetch = originalFetch;
}

console.log('\n✅ Done! Check middleware-costs.json for persisted data.');
