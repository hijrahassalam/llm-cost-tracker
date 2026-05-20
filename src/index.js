/**
 * llm-cost-tracker — Main entry point
 *
 * Exports createCostTracker(config) which wires together all subsystems:
 * pricing, tracking, analysis, optimization, and budget management.
 *
 * Usage:
 *   import { createCostTracker } from 'llm-cost-tracker';
 *
 *   const tracker = createCostTracker({
 *     providers: { xiaomi: { customPricing: { 'mimo-v2.5': { input: 0.1, output: 0.3 } } } },
 *     budget: { amount: 100, period: 'monthly' },
 *     alertThreshold: 0.8,
 *     storagePath: './cost-data.json',
 *   });
 *
 *   tracker.log({ provider: 'xiaomi', model: 'mimo-v2.5', inputTokens: 500, outputTokens: 200 });
 *   console.log(tracker.getStats('7d'));
 */

import { CostTracker } from './tracker.js';
import { CostAnalyzer } from './analyzer.js';
import { CostOptimizer } from './optimizer.js';
import { BudgetManager } from './budget.js';
import { updatePricing } from './pricing.js';

/**
 * Create a fully-wired cost tracker instance.
 *
 * @param {Object} config
 * @param {Object} [config.providers]          - Provider-specific config (custom pricing overrides)
 * @param {Object} [config.budget]             - { amount: number, period: 'daily'|'weekly'|'monthly' }
 * @param {number} [config.alertThreshold=0.8] - Alert when this fraction of budget is consumed (0-1)
 * @param {string} [config.storagePath]        - Path to persist cost data JSON file
 * @returns {Object} Cost tracker API
 */
export function createCostTracker(config = {}) {
  const {
    providers = {},
    budget = null,
    alertThreshold = 0.8,
    storagePath = null,
  } = config;

  // Apply any custom pricing overrides from provider config
  for (const [providerName, providerConfig] of Object.entries(providers)) {
    if (providerConfig.customPricing) {
      updatePricing(providerName, providerConfig.customPricing);
    }
  }

  // Instantiate subsystems
  const tracker = new CostTracker({ storagePath });
  const analyzer = new CostAnalyzer(tracker);
  const optimizer = new CostOptimizer(tracker, analyzer);
  const budgetManager = new BudgetManager(tracker, { amount: budget?.amount, period: budget?.period, alertThreshold });

  // Wire up alert callback: if budget threshold is exceeded, log a warning
  tracker.onLog(() => {
    if (budget) {
      const status = budgetManager.checkBudget();
      if (status.percentage >= alertThreshold * 100) {
        const msg = `⚠️  Budget alert: ${status.percentage.toFixed(1)}% consumed ($${status.spent.toFixed(4)} of $${status.remaining + status.spent}). ` +
          `Projected end-of-period: $${budgetManager.projectSpend().toFixed(4)}`;
        if (typeof config.onAlert === 'function') {
          config.onAlert(msg, status);
        } else {
          console.warn(msg);
        }
      }
    }
  });

  /**
   * Log a completed LLM API call.
   *
   * @param {Object} entry
   * @param {string} entry.provider    - Provider name (e.g. 'xiaomi', 'openai', 'anthropic')
   * @param {string} entry.model       - Model identifier (e.g. 'mimo-v2.5-pro')
   * @param {number} entry.inputTokens - Number of input/prompt tokens
   * @param {number} entry.outputTokens - Number of output/completion tokens
   * @param {number} [entry.cost]      - Override cost in USD (auto-calculated if omitted)
   * @param {string} [entry.prompt]    - Prompt text (hashed for grouping)
   * @param {Object} [entry.metadata]  - Arbitrary metadata (user id, session, etc.)
   * @returns {Object} The logged entry (with computed fields)
   */
  function log(entry) {
    return tracker.log(entry);
  }

  /**
   * Get aggregated cost statistics for a time period.
   *
   * @param {string} [period] - Time window: '24h', '7d', '30d', 'all' (default: 'all')
   * @returns {Object} { totalCost, totalTokens, avgCostPerCall, callsPerDay, totalCalls }
   */
  function getStats(period) {
    return analyzer.getStats(period);
  }

  /**
   * Get cost breakdown by model.
   *
   * @returns {Array<{ model: string, cost: number, percentage: number, calls: number }>}
   */
  function getCostByModel() {
    return analyzer.getCostByModel();
  }

  /**
   * Get cost breakdown by provider.
   *
   * @returns {Array<{ provider: string, cost: number, percentage: number, calls: number }>}
   */
  function getCostByProvider() {
    return analyzer.getCostByProvider();
  }

  /**
   * Get the most expensive prompt groups.
   *
   * @param {number} [topN=10] - Number of results
   * @returns {Array<{ promptHash: string, avgCost: number, calls: number, totalCost: number }>}
   */
  function getExpensivePrompts(topN) {
    return analyzer.getExpensivePrompts(topN);
  }

  /**
   * Generate cost optimization suggestions.
   *
   * @returns {Array<{ type: string, description: string, estimatedSavings: number }>}
   */
  function suggestSavings() {
    return optimizer.suggestSavings();
  }

  /**
   * Export cost data in the specified format.
   *
   * @param {'json'|'csv'} [format='json']
   * @returns {string} Serialized data
   */
  function exportData(format) {
    return tracker.export(format);
  }

  /**
   * Get cost trend data for charting.
   *
   * @param {number} [days=30] - Number of days to look back
   * @returns {Array<{ date: string, cost: number }>}
   */
  function getTrend(days) {
    return analyzer.getTrend(days);
  }

  /**
   * Detect cost anomalies (sudden spikes).
   *
   * @returns {Array<Object>} List of anomalous entries
   */
  function detectAnomalies() {
    return analyzer.detectAnomalies();
  }

  /**
   * Get current budget status.
   *
   * @returns {Object} { spent, remaining, percentage, onTrack }
   */
  function checkBudget() {
    return budgetManager.checkBudget();
  }

  /**
   * Get all logged entries (for inspection / export).
   *
   * @param {Object} [filters] - Optional filters: { startDate, endDate, provider, model }
   * @returns {Array<Object>}
   */
  function getEntries(filters) {
    return tracker.query(filters);
  }

  return {
    log,
    getStats,
    getCostByModel,
    getCostByProvider,
    getExpensivePrompts,
    suggestSavings,
    export: exportData,
    getTrend,
    detectAnomalies,
    checkBudget,
    getEntries,
    // Expose subsystems for advanced usage
    tracker,
    analyzer,
    optimizer,
    budgetManager,
  };
}

// Re-export all modules for direct access
export { CostTracker } from './tracker.js';
export { CostAnalyzer } from './analyzer.js';
export { CostOptimizer } from './optimizer.js';
export { BudgetManager } from './budget.js';
export { calculateCost, getProviderPricing, updatePricing, PROVIDERS } from './pricing.js';
export { costMiddleware, createFetchInterceptor } from './middleware.js';
