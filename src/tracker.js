/**
 * llm-cost-tracker — Cost Tracking Engine
 *
 * Core data layer: logs entries, persists to JSON, supports querying and aggregation.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { calculateCost } from './pricing.js';

/**
 * Simple deterministic hash for prompt grouping.
 * Uses first 500 chars to avoid hashing huge prompts.
 */
function hashPrompt(prompt) {
  if (!prompt) return null;
  const truncated = typeof prompt === 'string' ? prompt.slice(0, 500) : JSON.stringify(prompt).slice(0, 500);
  return createHash('sha256').update(truncated).digest('hex').slice(0, 12);
}

export class CostTracker {
  /**
   * @param {Object} options
   * @param {string} [options.storagePath] - Path to JSON file for persistence
   */
  constructor(options = {}) {
    this.entries = [];
    this.storagePath = options.storagePath || null;
    this._logListeners = [];
    this._loaded = false;
  }

  /**
   * Register a callback that fires after each log() call.
   * Used internally by the budget alert system.
   *
   * @param {Function} fn - Callback receiving the logged entry
   */
  onLog(fn) {
    this._logListeners.push(fn);
  }

  /**
   * Load entries from the JSON storage file (if it exists).
   * Called lazily on first access.
   */
  async _load() {
    if (this._loaded || !this.storagePath) return;
    try {
      const raw = await readFile(this.storagePath, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.entries)) {
        this.entries = data.entries;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`Warning: Could not load cost data from ${this.storagePath}: ${err.message}`);
      }
      // ENOENT is fine — first run, no data yet
    }
    this._loaded = true;
  }

  /**
   * Persist current entries to the JSON storage file.
   */
  async _save() {
    if (!this.storagePath) return;
    try {
      await mkdir(dirname(this.storagePath), { recursive: true });
      const data = {
        version: 1,
        updatedAt: new Date().toISOString(),
        entries: this.entries,
      };
      await writeFile(this.storagePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.warn(`Warning: Could not save cost data to ${this.storagePath}: ${err.message}`);
    }
  }

  /**
   * Log a completed LLM API call.
   *
   * @param {Object} entry
   * @param {string} entry.provider
   * @param {string} entry.model
   * @param {number} entry.inputTokens
   * @param {number} entry.outputTokens
   * @param {number} [entry.cost]       - Override; auto-calculated if omitted
   * @param {string} [entry.prompt]     - Prompt text (hashed for grouping)
   * @param {Object} [entry.metadata]   - Arbitrary metadata
   * @returns {Object} The enriched logged entry
   */
  log(entry) {
    const {
      provider,
      model,
      inputTokens = 0,
      outputTokens = 0,
      cost: overrideCost,
      prompt = null,
      metadata = {},
    } = entry;

    if (!provider || !model) {
      throw new Error('provider and model are required');
    }

    // Auto-calculate cost if not provided
    let cost = overrideCost;
    if (cost === undefined || cost === null) {
      cost = calculateCost(provider, model, inputTokens, outputTokens);
    }

    const logged = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      provider,
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cost,
      promptHash: hashPrompt(prompt),
      promptPreview: prompt ? String(prompt).slice(0, 100) : null,
      metadata,
    };

    this.entries.push(logged);

    // Notify listeners (budget alerts, etc.)
    for (const fn of this._logListeners) {
      try { fn(logged); } catch { /* listener errors are non-fatal */ }
    }

    // Persist asynchronously (fire-and-forget to keep log() synchronous)
    this._save().catch(() => {});

    return logged;
  }

  /**
   * Query entries with optional filters.
   *
   * @param {Object} [filters]
   * @param {string} [filters.startDate]  - ISO date string
   * @param {string} [filters.endDate]    - ISO date string
   * @param {string} [filters.provider]   - Filter by provider
   * @param {string} [filters.model]      - Filter by model
   * @param {string} [filters.promptHash] - Filter by prompt hash
   * @returns {Array<Object>} Matching entries
   */
  query(filters = {}) {
    let result = [...this.entries];

    if (filters.startDate) {
      const start = new Date(filters.startDate);
      result = result.filter(e => new Date(e.timestamp) >= start);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      result = result.filter(e => new Date(e.timestamp) <= end);
    }
    if (filters.provider) {
      result = result.filter(e => e.provider === filters.provider);
    }
    if (filters.model) {
      result = result.filter(e => e.model === filters.model);
    }
    if (filters.promptHash) {
      result = result.filter(e => e.promptHash === filters.promptHash);
    }

    return result;
  }

  /**
   * Aggregate entries into summary statistics.
   *
   * @param {Object} [filters] - Same filters as query()
   * @returns {Object} { totalCost, totalCalls, totalTokens, avgCostPerCall, costPerDay, costPerHour }
   */
  aggregate(filters = {}) {
    const entries = this.query(filters);
    const totalCost = entries.reduce((sum, e) => sum + e.cost, 0);
    const totalTokens = entries.reduce((sum, e) => sum + e.totalTokens, 0);
    const totalCalls = entries.length;

    // Calculate time span for per-day / per-hour stats
    let costPerDay = 0;
    let costPerHour = 0;
    if (entries.length >= 2) {
      const sorted = entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const first = new Date(sorted[0].timestamp);
      const last = new Date(sorted[sorted.length - 1].timestamp);
      const hours = Math.max((last - first) / (1000 * 60 * 60), 1);
      const days = Math.max(hours / 24, 1);
      costPerDay = totalCost / days;
      costPerHour = totalCost / hours;
    }

    return {
      totalCost,
      totalCalls,
      totalTokens,
      avgCostPerCall: totalCalls > 0 ? totalCost / totalCalls : 0,
      costPerDay,
      costPerHour,
    };
  }

  /**
   * Export all entries in the specified format.
   *
   * @param {'json'|'csv'} [format='json']
   * @returns {string} Serialized data
   */
  export(format = 'json') {
    if (format === 'csv') {
      if (this.entries.length === 0) return 'timestamp,provider,model,inputTokens,outputTokens,totalTokens,cost,promptHash\n';
      const headers = Object.keys(this.entries[0]).join(',');
      const rows = this.entries.map(e =>
        Object.values(e).map(v => {
          if (v === null || v === undefined) return '';
          if (typeof v === 'object') return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
          if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
          return String(v);
        }).join(',')
      );
      return [headers, ...rows].join('\n');
    }

    return JSON.stringify({ entries: this.entries, exportedAt: new Date().toISOString() }, null, 2);
  }

  /**
   * Get all entries (raw).
   *
   * @returns {Array<Object>}
   */
  getAll() {
    return [...this.entries];
  }

  /**
   * Clear all entries and optionally delete the storage file.
   */
  clear() {
    this.entries = [];
    this._save().catch(() => {});
  }
}
