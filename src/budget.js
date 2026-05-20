/**
 * llm-cost-tracker — Budget Management
 *
 * Set spending limits, track consumption, project end-of-period spend,
 * and trigger alerts when thresholds are exceeded.
 */

export class BudgetManager {
  /**
   * @param {import('./tracker.js').CostTracker} tracker
   * @param {Object} [options]
   * @param {number} [options.amount]         - Budget amount in USD
   * @param {string} [options.period='monthly'] - 'daily', 'weekly', or 'monthly'
   * @param {number} [options.alertThreshold=0.8] - Alert at this fraction (0-1)
   */
  constructor(tracker, options = {}) {
    this.tracker = tracker;
    this.alertThreshold = options.alertThreshold || 0.8;
    // Load persisted budget config if available
    const persisted = tracker.budgetConfig;
    this.amount = options.amount || persisted?.amount || 0;
    this.period = options.period || persisted?.period || 'monthly';
  }

  /**
   * Set or update the budget.
   *
   * @param {number} amount  - Budget in USD
   * @param {string} [period='monthly'] - 'daily', 'weekly', 'monthly'
   * @returns {Object} Updated budget config
   */
  setBudget(amount, period = 'monthly') {
    this.amount = amount;
    this.period = period;
    // Persist budget config to the data file
    if (this.tracker) {
      this.tracker.budgetConfig = { amount, period };
      this.tracker._save();
    }
    return {
      amount: this.amount,
      period: this.period,
      alertThreshold: this.alertThreshold,
    };
  }

  /**
   * Get the start date for the current budget period.
   *
   * @returns {Date}
   */
  _getPeriodStart() {
    const now = new Date();
    switch (this.period) {
      case 'daily':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'weekly': {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
        return new Date(now.getFullYear(), now.getMonth(), diff);
      }
      case 'monthly':
      default:
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }

  /**
   * Get the end date for the current budget period.
   *
   * @returns {Date}
   */
  _getPeriodEnd() {
    const now = new Date();
    switch (this.period) {
      case 'daily':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      case 'weekly': {
        const start = this._getPeriodStart();
        return new Date(start.getTime() + 7 * 86400_000);
      }
      case 'monthly':
      default:
        return new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }
  }

  /**
   * Check current budget status.
   *
   * @returns {{ spent: number, remaining: number, percentage: number, onTrack: boolean, budget: number, period: string }}
   */
  checkBudget() {
    if (!this.amount) {
      return { spent: 0, remaining: 0, percentage: 0, onTrack: true, budget: 0, period: this.period };
    }

    const periodStart = this._getPeriodStart();
    const periodEnd = this._getPeriodEnd();
    const entries = this.tracker.query({ startDate: periodStart.toISOString() });
    const spent = entries.reduce((sum, e) => sum + e.cost, 0);
    const remaining = Math.max(this.amount - spent, 0);
    const percentage = (spent / this.amount) * 100;

    // Determine if spending is on track
    const now = new Date();
    const periodDuration = periodEnd.getTime() - periodStart.getTime();
    const elapsed = now.getTime() - periodStart.getTime();
    const expectedPercentage = (elapsed / periodDuration) * 100;

    return {
      spent,
      remaining,
      percentage,
      onTrack: percentage <= expectedPercentage * 1.1, // 10% tolerance
      budget: this.amount,
      period: this.period,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    };
  }

  /**
   * Project end-of-period spend based on current burn rate.
   *
   * @returns {number} Projected total spend in USD
   */
  projectSpend() {
    const periodStart = this._getPeriodStart();
    const periodEnd = this._getPeriodEnd();
    const now = new Date();

    const entries = this.tracker.query({ startDate: periodStart.toISOString() });
    const spent = entries.reduce((sum, e) => sum + e.cost, 0);

    const periodDuration = periodEnd.getTime() - periodStart.getTime();
    const elapsed = now.getTime() - periodStart.getTime();

    if (elapsed <= 0) return 0;

    const rate = spent / elapsed; // USD per ms
    return rate * periodDuration;
  }

  /**
   * Get a human-readable summary of the budget status.
   *
   * @returns {string}
   */
  getSummary() {
    if (!this.amount) return 'No budget set.';

    const status = this.checkBudget();
    const projected = this.projectSpend();
    const emoji = status.onTrack ? '✅' : '⚠️';

    return [
      `${emoji} Budget: $${this.amount.toFixed(2)}/${this.period}`,
      `  Spent: $${status.spent.toFixed(4)} (${status.percentage.toFixed(1)}%)`,
      `  Remaining: $${status.remaining.toFixed(4)}`,
      `  Projected: $${projected.toFixed(4)}`,
      `  On track: ${status.onTrack ? 'Yes' : 'No — consider reducing usage'}`,
    ].join('\n');
  }
}
