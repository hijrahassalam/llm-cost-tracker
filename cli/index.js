#!/usr/bin/env node

/**
 * llm-cost-tracker CLI
 *
 * Commands:
 *   llm-cost log       --provider xiaomi --model mimo-v2.5 --input 500 --output 200
 *   llm-cost stats     [--period 7d]
 *   llm-cost models
 *   llm-cost providers
 *   llm-cost expensive [--top 10]
 *   llm-cost trend     [--days 30]
 *   llm-cost anomalies
 *   llm-cost suggest
 *   llm-cost budget    --set 50 [--period monthly]
 *   llm-cost budget    (show status)
 *   llm-cost export    [--format csv|json]
 *   llm-cost clear     (delete all data)
 *
 * Uses node:util parseArgs — zero external dependencies.
 */

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { createCostTracker } from '../src/index.js';

// ─── Default storage path ─────────────────────────────────────────────────────
const DEFAULT_STORAGE = resolve(process.cwd(), 'cost-data.json');

// ─── CLI Helpers ──────────────────────────────────────────────────────────────

function printTable(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length)));
  const sep = widths.map(w => '─'.repeat(w + 2)).join('┼');
  const headerLine = headers.map((h, i) => ` ${h.padEnd(widths[i])} `).join('│');
  const dataLines = rows.map(r => r.map((c, i) => ` ${String(c ?? '').padEnd(widths[i])} `).join('│'));

  console.log(headerLine);
  console.log(sep);
  dataLines.forEach(l => console.log(l));
}

function formatUSD(n) {
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Parse Arguments ──────────────────────────────────────────────────────────

const { values, positionals } = parseArgs({
  options: {
    provider: { type: 'string', short: 'p' },
    model: { type: 'string', short: 'm' },
    input: { type: 'string', short: 'i' },
    output: { type: 'string', short: 'o' },
    period: { type: 'string' },
    days: { type: 'string' },
    top: { type: 'string', short: 't' },
    set: { type: 'string' },
    format: { type: 'string', short: 'f' },
    storage: { type: 'string', short: 's' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
  strict: false,
});

const command = positionals[0];
const storagePath = values.storage ? resolve(values.storage) : DEFAULT_STORAGE;

// ─── Initialize Tracker ───────────────────────────────────────────────────────

const tracker = createCostTracker({ storagePath });

// ─── Command Dispatch ─────────────────────────────────────────────────────────

async function run() {
  if (values.help || !command) {
    printHelp();
    return;
  }

  switch (command) {
    case 'log':
      await cmdLog();
      break;
    case 'stats':
      await cmdStats();
      break;
    case 'models':
      await cmdModels();
      break;
    case 'providers':
      await cmdProviders();
      break;
    case 'expensive':
      await cmdExpensive();
      break;
    case 'trend':
      await cmdTrend();
      break;
    case 'anomalies':
      await cmdAnomalies();
      break;
    case 'suggest':
      await cmdSuggest();
      break;
    case 'budget':
      await cmdBudget();
      break;
    case 'export':
      await cmdExport();
      break;
    case 'clear':
      await cmdClear();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run `llm-cost --help` for usage.');
      process.exit(1);
  }
}

// ─── Command Implementations ──────────────────────────────────────────────────

async function cmdLog() {
  const provider = values.provider;
  const model = values.model;
  const inputTokens = parseInt(values.input || '0', 10);
  const outputTokens = parseInt(values.output || '0', 10);

  if (!provider || !model) {
    console.error('Error: --provider and --model are required');
    console.error('Usage: llm-cost log --provider xiaomi --model mimo-v2.5 --input 500 --output 200');
    process.exit(1);
  }

  const entry = tracker.log({ provider, model, inputTokens, outputTokens });
  console.log('✅ Logged:');
  console.log(`   Provider: ${entry.provider}`);
  console.log(`   Model:    ${entry.model}`);
  console.log(`   Tokens:   ${formatTokens(entry.inputTokens)} in + ${formatTokens(entry.outputTokens)} out = ${formatTokens(entry.totalTokens)} total`);
  console.log(`   Cost:     ${formatUSD(entry.cost)}`);
  console.log(`   Time:     ${entry.timestamp}`);
}

async function cmdStats() {
  const period = values.period || 'all';
  const stats = tracker.getStats(period);

  console.log(`📊 Cost Statistics (${period})`);
  console.log('─'.repeat(40));
  console.log(`  Total Cost:      ${formatUSD(stats.totalCost)}`);
  console.log(`  Total Tokens:    ${formatTokens(stats.totalTokens)}`);
  console.log(`  Total Calls:     ${stats.totalCalls}`);
  console.log(`  Avg Cost/Call:   ${formatUSD(stats.avgCostPerCall)}`);
  console.log(`  Calls/Day:       ${stats.callsPerDay.toFixed(1)}`);
}

async function cmdModels() {
  const models = tracker.getCostByModel();
  if (models.length === 0) {
    console.log('No data yet. Use `llm-cost log` to track some calls first.');
    return;
  }

  console.log('🤖 Cost by Model');
  console.log();
  printTable(
    ['Model', 'Cost', 'Calls', '% of Total'],
    models.map(m => [m.model, formatUSD(m.cost), m.calls, `${m.percentage.toFixed(1)}%`])
  );
}

async function cmdProviders() {
  const providers = tracker.getCostByProvider();
  if (providers.length === 0) {
    console.log('No data yet.');
    return;
  }

  console.log('🏢 Cost by Provider');
  console.log();
  printTable(
    ['Provider', 'Cost', 'Calls', '% of Total'],
    providers.map(p => [p.provider, formatUSD(p.cost), p.calls, `${p.percentage.toFixed(1)}%`])
  );
}

async function cmdExpensive() {
  const topN = parseInt(values.top || '10', 10);
  const prompts = tracker.getExpensivePrompts(topN);
  if (prompts.length === 0) {
    console.log('No prompt data yet.');
    return;
  }

  console.log(`💸 Top ${topN} Most Expensive Prompts`);
  console.log();
  printTable(
    ['Hash', 'Preview', 'Calls', 'Total Cost', 'Avg Cost'],
    prompts.map(p => [
      p.promptHash,
      (p.promptPreview || '(none)').slice(0, 40),
      p.calls,
      formatUSD(p.totalCost),
      formatUSD(p.avgCost),
    ])
  );
}

async function cmdTrend() {
  const days = parseInt(values.days || '30', 10);
  const trend = tracker.getTrend(days);
  if (trend.length === 0) {
    console.log('No data yet.');
    return;
  }

  console.log(`📈 Cost Trend (last ${days} days)`);
  console.log();
  printTable(
    ['Date', 'Cost', 'Calls'],
    trend.map(t => [t.date, formatUSD(t.cost), t.calls])
  );
}

async function cmdAnomalies() {
  const anomalies = tracker.detectAnomalies();
  if (anomalies.length === 0) {
    console.log('✅ No anomalies detected.');
    return;
  }

  console.log(`🚨 ${anomalies.length} Anomalies Detected`);
  console.log();
  for (const a of anomalies) {
    console.log(`  ${a.timestamp}  ${a.provider}/${a.model}  ${formatUSD(a.cost)}  (z-score: ${a.zScore}, mean: ${formatUSD(a.meanCost)})`);
  }
}

async function cmdSuggest() {
  const suggestions = tracker.suggestSavings();
  if (suggestions.length === 0) {
    console.log('💡 No suggestions — either usage is already optimized, or not enough data yet.');
    return;
  }

  console.log(`💡 ${suggestions.length} Optimization Suggestions`);
  console.log('─'.repeat(60));
  for (const s of suggestions) {
    const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[s.priority] || '⚪';
    console.log();
    console.log(`${emoji} [${s.type}] ${formatUSD(s.estimatedSavings)} estimated savings`);
    console.log(`   ${s.description}`);
  }
  console.log();
  console.log('─'.repeat(60));
  const total = suggestions.reduce((s, x) => s + x.estimatedSavings, 0);
  console.log(`Total potential savings: ${formatUSD(total)}`);
}

async function cmdBudget() {
  if (values.set) {
    const amount = parseFloat(values.set);
    const period = values.period || 'monthly';
    tracker.budgetManager.setBudget(amount, period);
    console.log(`✅ Budget set: ${formatUSD(amount)}/${period}`);
    console.log(`   Alert threshold: ${(tracker.budgetManager.alertThreshold * 100).toFixed(0)}%`);
  } else {
    console.log(tracker.budgetManager.getSummary());
  }
}

async function cmdExport() {
  const format = values.format || 'json';
  const data = tracker.export(format);
  console.log(data);
}

async function cmdClear() {
  tracker.tracker.clear();
  console.log('✅ All cost data cleared.');
}

function printHelp() {
  console.log(`
💰 LLM Cost Tracker CLI

USAGE:
  llm-cost <command> [options]

COMMANDS:
  log         Log an LLM API call
  stats       Show cost statistics
  models      Cost breakdown by model
  providers   Cost breakdown by provider
  expensive   Most expensive prompts
  trend       Daily cost trend
  anomalies   Detect cost anomalies
  suggest     Optimization suggestions
  budget      Set/check budget
  export      Export data as CSV or JSON
  clear       Delete all tracked data

OPTIONS:
  -p, --provider    Provider name (e.g. xiaomi, openai, anthropic)
  -m, --model       Model identifier (e.g. mimo-v2.5, gpt-4o)
  -i, --input       Input token count
  -o, --output      Output token count
  --period          Time period: 24h, 7d, 30d, all (default: all)
                    Budget period: daily, weekly, monthly
  --days            Number of days for trend (default: 30)
  -t, --top         Number of results for expensive (default: 10)
  --set             Set budget amount in USD
  -f, --format      Export format: json, csv (default: json)
  -s, --storage     Path to cost data file (default: ./cost-data.json)
  -h, --help        Show this help

EXAMPLES:
  llm-cost log --provider xiaomi --model mimo-v2.5 --input 500 --output 200
  llm-cost stats --period 7d
  llm-cost suggest
  llm-cost budget --set 50 --period monthly
  llm-cost export --format csv > costs.csv
`);
}

// ─── Run ──────────────────────────────────────────────────────────────────────
run().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
