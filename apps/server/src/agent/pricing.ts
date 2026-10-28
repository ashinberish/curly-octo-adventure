// Rough cost of a turn from its usage, for the office's daily budget and the per-task
// cost shown in the UI. Estimates only: a refusal fallback is billed at the fallback
// model's rates, and prices change; the Anthropic Console is the source of truth.
import type Anthropic from '@anthropic-ai/sdk';

/** US dollars per million tokens. */
interface Price { input: number; output: number; cacheRead: number; cacheWrite: number }

const PRICES: Record<string, Price> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};
const UNKNOWN: Price = { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 }; // err high for models not listed
const WEB_SEARCH_USD = 10 / 1000;

export function turnCostUsd(model: string, usage: Anthropic.Beta.BetaUsage | null | undefined): number {
  if (!usage) return 0;
  const p = PRICES[model] ?? UNKNOWN;
  const tokens =
    usage.input_tokens * p.input +
    usage.output_tokens * p.output +
    (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
    (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite;
  const searches = usage.server_tool_use?.web_search_requests ?? 0;
  return tokens / 1_000_000 + searches * WEB_SEARCH_USD;
}
