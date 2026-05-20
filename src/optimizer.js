/**
 * llm-cost-tracker — Cost Optimizer
 *
 * Analyzes usage patterns and generates actionable suggestions to reduce LLM costs.
 *
 * ⚠️  PRODUCTION LESSON:
 * Thinking models (e.g. mimo-v2.5-pro) use ~10x more tokens than non-thinking
 * (e.g. mimo-v2.5) for the same task — discovered after a $200 surprise bill.
 * Always compare thinking vs non-thinking cost per quality, not just per call.
 */

import { PROVIDERS, THINKING_MODEL_PAIRS } from './pricing.js';

export class CostOptimizer {
  /**
   * @param {import('./tracker.js').CostTracker} tracker
   * @param {import('./analyzer.js').CostAnalyzer} analyzer
   */
  constructor(tracker, analyzer) {
    this.tracker = tracker;
    this.analyzer = analyzer;
  }

  /**
   * Generate all cost optimization suggestions.
   *
   * @returns {Array<{ type: string, description: string, estimatedSavings: number, priority: string }>}
   */
  suggestSavings() {
    const suggestions = [];

    suggestions.push(...this._suggestModelSwitch());
    suggestions.push(...this._suggestThinkingVsNonThinking());
    suggestions.push(...this._suggestReduceMaxTokens());
    suggestions.push(...this._suggestCaching());
    suggestions.push(...this._suggestBatching());

    // Sort by estimated savings descending
    return suggestions.sort((a, b) => b.estimatedSavings - a.estimatedSavings);
  }

  /**
   * Suggest switching to cheaper models when usage patterns indicate it's feasible.
   */
  _suggestModelSwitch() {
    const suggestions = [];
    const byModel = this.analyzer.getCostByModel();
    const totalCost = byModel.reduce((sum, m) => sum + m.cost, 0);

    for (const usage of byModel) {
      const [provider, model] = usage.model.split('/');
      const providerData = PROVIDERS[provider];
      if (!providerData) continue;

      // Find cheaper models from the same provider
      const currentPricing = providerData.models[model];
      if (!currentPricing) continue;

      for (const [candidateModel, candidatePricing] of Object.entries(providerData.models)) {
        if (candidateModel === model) continue;
        const currentAvg = (currentPricing.input + currentPricing.output) / 2;
        const candidateAvg = (candidatePricing.input + candidatePricing.output) / 2;

        if (candidateAvg < currentAvg * 0.5) {
          const savingsPerCall = ((currentPricing.input + currentPricing.output) - (candidatePricing.input + candidatePricing.output)) / 2;
          // Estimate using average tokens per call from this model's entries
          const entries = this.tracker.query({ provider, model });
          const avgTokens = entries.length > 0
            ? entries.reduce((s, e) => s + e.totalTokens, 0) / entries.length
            : 1000;
          const estimatedSavings = (savingsPerCall * avgTokens / 1_000_000) * entries.length;

          if (estimatedSavings > 0.01) {
            suggestions.push({
              type: 'model_switch',
              description: `Switch ${provider}/${model} → ${provider}/${candidateModel} (${candidatePricing.description || 'cheaper alternative'}). ` +
                `Current cost: $${usage.cost.toFixed(4)} (${usage.calls} calls). ` +
                `Savings per 1M tokens: $${(currentAvg - candidateAvg).toFixed(2)}`,
              estimatedSavings,
              priority: estimatedSavings > 1 ? 'high' : estimatedSavings > 0.1 ? 'medium' : 'low',
              details: {
                from: `${provider}/${model}`,
                to: `${provider}/${candidateModel}`,
                currentCostPerMillion: currentAvg,
                candidateCostPerMillion: candidateAvg,
              },
            });
          }
        }
      }
    }

    return suggestions;
  }

  /**
   * Specifically flag thinking model usage and suggest non-thinking alternatives.
   *
   * This is the #1 cost pitfall in production. Thinking models use ~10x more tokens
   * for the same task. A $200/mo bill can be reduced to $20/mo by switching simple
   * tasks to non-thinking models.
   */
  _suggestThinkingVsNonThinking() {
    const suggestions = [];
    const byModel = this.analyzer.getCostByModel();

    for (const pair of THINKING_MODEL_PAIRS) {
      const thinkingUsage = byModel.find(m => m.model === `${pair.provider}/${pair.thinking}`);
      const nonThinkingUsage = byModel.find(m => m.model === `${pair.provider}/${pair.nonThinking}`);

      if (!thinkingUsage || thinkingUsage.calls === 0) continue;

      // Get entries for the thinking model
      const entries = this.tracker.query({ provider: pair.provider, model: pair.thinking });
      const avgTokensPerCall = entries.length > 0
        ? entries.reduce((s, e) => s + e.totalTokens, 0) / entries.length
        : 0;

      // If thinking model averages very high tokens, flag it
      if (avgTokensPerCall > 5000 || thinkingUsage.cost > 0.5) {
        // Estimate: non-thinking model uses ~10x fewer tokens for same task
        const estimatedNonThinkingTokens = avgTokensPerCall / 10;
        const providerData = PROVIDERS[pair.provider];
        const nonThinkingPricing = providerData?.models[pair.nonThinking];
        if (!nonThinkingPricing) continue;

        const estimatedNonThinkingCost = entries.reduce((sum, e) => {
          // Re-estimate cost with non-thinking model
          const inputCost = (e.inputTokens / 1_000_000) * nonThinkingPricing.input;
          // Output tokens would be ~10x less
          const outputCost = (e.outputTokens / 10 / 1_000_000) * nonThinkingPricing.output;
          return sum + inputCost + outputCost;
        }, 0);

        const savings = thinkingUsage.cost - estimatedNonThinkingCost;

        if (savings > 0.05) {
          suggestions.push({
            type: 'thinking_vs_non_thinking',
            description: `🧠→⚡ ${pair.provider}/${pair.thinking} costs $${thinkingUsage.cost.toFixed(2)} for ${thinkingUsage.calls} calls ` +
              `(avg ${Math.round(avgTokensPerCall)} tokens/call). ` +
              `Switch simple tasks to ${pair.nonThinking} — estimated ~10x fewer tokens per call. ` +
              `⚠️ Real-world lesson: thinking models burn 10x tokens for the same task.`,
            estimatedSavings: savings,
            priority: savings > 5 ? 'critical' : savings > 1 ? 'high' : 'medium',
            details: {
              thinkingModel: pair.thinking,
              nonThinkingModel: pair.nonThinking,
              avgTokensPerCall,
              thinkingCost: thinkingUsage.cost,
              estimatedNonThinkingCost,
            },
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Suggest reducing max_tokens when output is consistently below the limit.
   */
  _suggestReduceMaxTokens() {
    const suggestions = [];
    const entries = this.tracker.getAll();

    // Group by model and check average output tokens
    const modelOutputs = new Map();
    for (const e of entries) {
      const key = `${e.provider}/${e.model}`;
      const existing = modelOutputs.get(key) || { total: 0, count: 0 };
      existing.total += e.outputTokens;
      existing.count += 1;
      modelOutputs.set(key, existing);
    }

    for (const [model, stats] of modelOutputs) {
      const avgOutput = stats.total / stats.count;
      // If average output is very low, suggest reducing max_tokens
      if (avgOutput < 200 && stats.count >= 5) {
        const modelEntries = entries.filter(e => `${e.provider}/${e.model}` === model);
        const totalOutputCost = modelEntries.reduce((sum, e) => {
          // Rough estimate of output cost portion
          return sum + (e.cost * (e.outputTokens / (e.inputTokens + e.outputTokens || 1)));
        }, 0);
        const savings = totalOutputCost * 0.3; // ~30% savings estimate

        if (savings > 0.01) {
          suggestions.push({
            type: 'reduce_max_tokens',
            description: `Model ${model} averages only ${Math.round(avgOutput)} output tokens. ` +
              `Setting max_tokens=${Math.ceil(avgOutput * 1.2)} could reduce costs by ~30%.`,
            estimatedSavings: savings,
            priority: 'low',
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Estimate savings from caching repeated prompts.
   */
  _suggestCaching() {
    const suggestions = [];
    const expensive = this.analyzer.getExpensivePrompts(20);

    let cacheableSavings = 0;
    let cacheableCalls = 0;

    for (const prompt of expensive) {
      if (prompt.calls >= 3) {
        // Each repeat call after the first could be a cache hit
        cacheableSavings += prompt.totalCost - prompt.avgCost;
        cacheableCalls += prompt.calls - 1;
      }
    }

    if (cacheableSavings > 0.05) {
      suggestions.push({
        type: 'cache_hits',
        description: `${cacheableCalls} calls are repeated prompts that could be cached. ` +
          `Implementing semantic caching could save ~$${cacheableSavings.toFixed(4)}. ` +
          `Top repeated prompts: ${expensive.slice(0, 3).map(p => `"${p.promptPreview}..." (${p.calls}x)`).join(', ')}`,
        estimatedSavings: cacheableSavings,
        priority: cacheableSavings > 5 ? 'high' : 'medium',
        details: {
          cacheableCalls,
          topPrompts: expensive.filter(p => p.calls >= 3).slice(0, 5),
        },
      });
    }

    return suggestions;
  }

  /**
   * Suggest batching multiple prompts into single API calls.
   */
  _suggestBatching() {
    const suggestions = [];
    const entries = this.tracker.getAll();

    // Look for clusters of calls within short time windows
    if (entries.length < 10) return suggestions;

    const sorted = [...entries].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    let burstCount = 0;
    let burstCost = 0;

    for (let i = 1; i < sorted.length; i++) {
      const gap = new Date(sorted[i].timestamp) - new Date(sorted[i - 1].timestamp);
      if (gap < 5000) { // Calls within 5 seconds = burst
        burstCount++;
        burstCost += sorted[i].cost;
      }
    }

    if (burstCount >= 5) {
      const savings = burstCost * 0.2; // ~20% overhead reduction from batching
      suggestions.push({
        type: 'batch_requests',
        description: `${burstCount} API calls were made within 5 seconds of each other. ` +
          `Consider batching these into fewer, larger requests to reduce per-call overhead.`,
        estimatedSavings: savings,
        priority: 'low',
      });
    }

    return suggestions;
  }
}
