/**
 * llm-cost-tracker — Cost Analyzer
 *
 * Provides analytical queries over tracked cost data:
 * stats, breakdowns by model/provider, expensive prompts, trends, anomaly detection.
 */

export class CostAnalyzer {
  /**
   * @param {import('./tracker.js').CostTracker} tracker
   */
  constructor(tracker) {
    this.tracker = tracker;
  }

  /**
   * Parse a period string into a start date.
   *
   * @param {string} [period] - '24h', '7d', '30d', '90d', or 'all'
   * @returns {Date|null} Start date, or null for 'all'
   */
  _parsePeriod(period) {
    if (!period || period === 'all') return null;
    const now = new Date();
    const match = period.match(/^(\d+)([hd])$/);
    if (!match) return null;
    const [, num, unit] = match;
    const ms = unit === 'h' ? Number(num) * 3600_000 : Number(num) * 86400_000;
    return new Date(now.getTime() - ms);
  }

  /**
   * Get aggregated cost statistics for a time period.
   *
   * @param {string} [period='all'] - Time window: '24h', '7d', '30d', 'all'
   * @returns {Object} { totalCost, totalTokens, avgCostPerCall, callsPerDay, totalCalls }
   */
  getStats(period = 'all') {
    const startDate = this._parsePeriod(period);
    const filters = startDate ? { startDate: startDate.toISOString() } : {};
    const agg = this.tracker.aggregate(filters);

    const entries = this.tracker.query(filters);
    let callsPerDay = 0;
    if (entries.length >= 2) {
      const sorted = [...entries].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const first = new Date(sorted[0].timestamp);
      const last = new Date(sorted[sorted.length - 1].timestamp);
      const days = Math.max((last - first) / (1000 * 60 * 60 * 24), 1);
      callsPerDay = entries.length / days;
    }

    return {
      totalCost: agg.totalCost,
      totalTokens: agg.totalTokens,
      avgCostPerCall: agg.avgCostPerCall,
      callsPerDay,
      totalCalls: agg.totalCalls,
    };
  }

  /**
   * Get cost breakdown by model.
   *
   * @returns {Array<{ model: string, cost: number, percentage: number, calls: number }>}
   */
  getCostByModel() {
    const entries = this.tracker.getAll();
    const totalCost = entries.reduce((sum, e) => sum + e.cost, 0);

    const map = new Map();
    for (const e of entries) {
      const key = `${e.provider}/${e.model}`;
      const existing = map.get(key) || { model: key, cost: 0, calls: 0 };
      existing.cost += e.cost;
      existing.calls += 1;
      map.set(key, existing);
    }

    return [...map.values()]
      .map(m => ({ ...m, percentage: totalCost > 0 ? (m.cost / totalCost) * 100 : 0, cost: round6(m.cost) }))
      .sort((a, b) => b.cost - a.cost);
  }

  /**
   * Get cost breakdown by provider.
   *
   * @returns {Array<{ provider: string, cost: number, percentage: number, calls: number }>}
   */
  getCostByProvider() {
    const entries = this.tracker.getAll();
    const totalCost = entries.reduce((sum, e) => sum + e.cost, 0);

    const map = new Map();
    for (const e of entries) {
      const existing = map.get(e.provider) || { provider: e.provider, cost: 0, calls: 0 };
      existing.cost += e.cost;
      existing.calls += 1;
      map.set(e.provider, existing);
    }

    return [...map.values()]
      .map(p => ({ ...p, percentage: totalCost > 0 ? (p.cost / totalCost) * 100 : 0, cost: round6(p.cost) }))
      .sort((a, b) => b.cost - a.cost);
  }

  /**
   * Get the most expensive prompt groups (by prompt hash).
   *
   * @param {number} [topN=10]
   * @returns {Array<{ promptHash: string, promptPreview: string, avgCost: number, calls: number, totalCost: number }>}
   */
  getExpensivePrompts(topN = 10) {
    const entries = this.tracker.getAll().filter(e => e.promptHash);
    const map = new Map();

    for (const e of entries) {
      const existing = map.get(e.promptHash) || {
        promptHash: e.promptHash,
        promptPreview: e.promptPreview,
        totalCost: 0,
        calls: 0,
      };
      existing.totalCost += e.cost;
      existing.calls += 1;
      if (!existing.promptPreview && e.promptPreview) {
        existing.promptPreview = e.promptPreview;
      }
      map.set(e.promptHash, existing);
    }

    return [...map.values()]
      .map(p => ({
        ...p,
        avgCost: round6(p.totalCost / p.calls),
        totalCost: round6(p.totalCost),
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, topN);
  }

  /**
   * Get daily cost trend for charting.
   *
   * @param {number} [days=30]
   * @returns {Array<{ date: string, cost: number, calls: number }>}
   */
  getTrend(days = 30) {
    const startDate = new Date(Date.now() - days * 86400_000);
    const entries = this.tracker.query({ startDate: startDate.toISOString() });

    const map = new Map();
    for (const e of entries) {
      const date = e.timestamp.slice(0, 10); // YYYY-MM-DD
      const existing = map.get(date) || { date, cost: 0, calls: 0 };
      existing.cost += e.cost;
      existing.calls += 1;
      map.set(date, existing);
    }

    // Fill in missing dates with zero cost
    const result = [];
    const cursor = new Date(startDate);
    const today = new Date();
    while (cursor <= today) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const entry = map.get(dateStr) || { date: dateStr, cost: 0, calls: 0 };
      result.push({ ...entry, cost: round6(entry.cost) });
      cursor.setDate(cursor.getDate() + 1);
    }

    return result;
  }

  /**
   * Detect cost anomalies — entries with cost significantly above the mean.
   *
   * Uses a simple z-score approach: any entry with cost > mean + 2*stddev is flagged.
   *
   * @returns {Array<Object>} Anomalous entries with z-score
   */
  detectAnomalies() {
    const entries = this.tracker.getAll();
    if (entries.length < 5) return []; // Need enough data

    const costs = entries.map(e => e.cost);
    const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
    const variance = costs.reduce((sum, c) => sum + (c - mean) ** 2, 0) / costs.length;
    const stddev = Math.sqrt(variance);

    if (stddev === 0) return []; // All identical

    const threshold = mean + 2 * stddev;

    return entries
      .filter(e => e.cost > threshold)
      .map(e => ({
        ...e,
        zScore: round6((e.cost - mean) / stddev),
        meanCost: round6(mean),
        threshold: round6(threshold),
      }))
      .sort((a, b) => b.zScore - a.zScore);
  }
}

/** Round to 6 decimal places to avoid floating-point noise */
function round6(n) {
  return Math.round(n * 1_000_000) / 1_000_000;
}
