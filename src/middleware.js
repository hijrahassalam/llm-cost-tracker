/**
 * llm-cost-tracker — Middleware for Auto-Tracking
 *
 * Provides middleware that wraps fetch() to automatically intercept
 * OpenAI-compatible API calls, extract token usage from responses,
 * calculate costs, and log them to the tracker.
 *
 * Works with any OpenAI-compatible provider (OpenAI, DeepSeek, Xiaomi, etc.)
 */

import { calculateCost } from './pricing.js';

/**
 * Known provider base URL patterns for auto-detection.
 */
const PROVIDER_URL_PATTERNS = [
  { pattern: /api\.openai\.com/, provider: 'openai' },
  { pattern: /openrouter\.ai/, provider: 'openrouter' },
  { pattern: /api\.deepseek\.com/, provider: 'deepseek' },
  { pattern: /api\.minimax\.chat/, provider: 'minimax' },
  { pattern: /api\.anthropic\.com/, provider: 'anthropic' },
];

/**
 * Detect provider from URL.
 */
function detectProvider(url) {
  for (const { pattern, provider } of PROVIDER_URL_PATTERNS) {
    if (pattern.test(url)) return provider;
  }
  return null;
}

/**
 * Create a fetch interceptor that automatically tracks LLM API costs.
 *
 * @param {Object} options
 * @param {Object} options.tracker     - CostTracker instance (from createCostTracker)
 * @param {string} [options.provider]  - Override provider name (auto-detected from URL if omitted)
 * @param {string} [options.baseUrl]   - Only intercept calls to this base URL
 * @returns {Function} Wrapped fetch function
 *
 * @example
 *   import { createCostTracker } from 'llm-cost-tracker';
 *   import { createFetchInterceptor } from 'llm-cost-tracker/middleware';
 *
 *   const tracker = createCostTracker({ storagePath: './costs.json' });
 *   globalThis.fetch = createFetchInterceptor({ tracker, provider: 'xiaomi' });
 *
 *   // Now all fetch calls to LLM APIs are automatically tracked
 *   const res = await fetch('https://api.example.com/v1/chat/completions', { ... });
 */
export function createFetchInterceptor(options) {
  const { tracker, provider: defaultProvider, baseUrl } = options;
  const originalFetch = globalThis.fetch;

  return async function interceptedFetch(url, init) {
    const urlString = typeof url === 'string' ? url : url.toString();

    // Only intercept chat completion requests
    const isLLMRequest = urlString.includes('/chat/completions') ||
      urlString.includes('/completions') ||
      (baseUrl && urlString.startsWith(baseUrl));

    if (!isLLMRequest) {
      return originalFetch(url, init);
    }

    // Parse the request body to get model info
    let requestBody = {};
    try {
      if (init?.body) {
        requestBody = typeof init.body === 'string' ? JSON.parse(init.body) : JSON.parse(await init.body);
      }
    } catch {
      // If we can't parse the body, just pass through
      return originalFetch(url, init);
    }

    const model = requestBody.model;
    const provider = defaultProvider || detectProvider(urlString) || 'unknown';

    // Make the actual request
    const response = await originalFetch(url, init);

    // Clone the response so we can read the body without consuming it
    const clonedResponse = response.clone();

    // Parse the response to extract token usage
    try {
      const responseBody = await clonedResponse.json();
      const usage = responseBody.usage;

      if (usage) {
        const inputTokens = usage.prompt_tokens || 0;
        const outputTokens = usage.completion_tokens || 0;

        try {
          tracker.log({
            provider,
            model,
            inputTokens,
            outputTokens,
            prompt: requestBody.messages?.[0]?.content,
            metadata: {
              intercepted: true,
              url: urlString,
              maxTokens: requestBody.max_tokens,
              temperature: requestBody.temperature,
            },
          });
        } catch (err) {
          // Don't let tracking errors break the actual API call
          console.warn(`llm-cost-tracker: Failed to log cost: ${err.message}`);
        }
      }
    } catch {
      // Non-JSON response or streaming — skip tracking
    }

    return response;
  };
}

/**
 * Express-compatible middleware for auto-tracking LLM API costs.
 *
 * Wraps the response to extract token usage from outgoing LLM API proxy responses.
 *
 * @param {Object} options
 * @param {Object} options.tracker     - CostTracker instance
 * @param {string} [options.provider]  - Provider name
 * @param {string} [options.path]      - Route path to intercept (default: '/api/chat')
 * @returns {Function} Express middleware (req, res, next)
 *
 * @example
 *   import express from 'express';
 *   import { createCostTracker } from 'llm-cost-tracker';
 *   import { costMiddleware } from 'llm-cost-tracker/middleware';
 *
 *   const tracker = createCostTracker({ storagePath: './costs.json' });
 *   const app = express();
 *   app.use(costMiddleware({ tracker, provider: 'xiaomi' }));
 */
export function costMiddleware(options) {
  const { tracker, provider: defaultProvider, path: targetPath } = options;

  return function middleware(req, res, next) {
    // Only intercept POST requests to chat completion endpoints
    if (req.method !== 'POST') return next();

    const isLLMEndpoint = req.path.includes('/chat/completions') ||
      req.path.includes('/completions') ||
      (targetPath && req.path === targetPath);

    if (!isLLMEndpoint) return next();

    // Capture the original json method
    const originalJson = res.json.bind(res);

    res.json = function interceptedJson(body) {
      // Extract token usage from the response
      const usage = body?.usage;
      if (usage) {
        const model = req.body?.model;
        const provider = defaultProvider || detectProvider(req.originalUrl) || 'unknown';

        try {
          tracker.log({
            provider,
            model,
            inputTokens: usage.prompt_tokens || 0,
            outputTokens: usage.completion_tokens || 0,
            prompt: req.body?.messages?.[0]?.content,
            metadata: {
              middleware: true,
              path: req.path,
              method: req.method,
            },
          });
        } catch (err) {
          console.warn(`llm-cost-tracker middleware: Failed to log: ${err.message}`);
        }
      }

      return originalJson(body);
    };

    next();
  };
}
