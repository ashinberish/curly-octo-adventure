// The real model call: Anthropic SDK, streamed (long turns would otherwise hit HTTP
// timeouts) and collected with finalMessage().
import Anthropic from '@anthropic-ai/sdk';
import { MODEL_TIMEOUT_MS, type CallModel } from './config.ts';

/** Server-side refusal fallback: a declined turn is re-run on Anthropic's recommended model. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export function claudeCaller(apiKey: string): CallModel {
  // Turns run inside a serverless function with a ~5 minute ceiling: no SDK retries (a
  // failed turn is retried by a later /work call instead) and a timeout that fits.
  const client = new Anthropic({ apiKey, timeout: MODEL_TIMEOUT_MS, maxRetries: 0 });
  return async params => {
    const stream = client.beta.messages.stream({
      ...params,
      betas: [...(params.betas ?? []), FALLBACK_BETA],
      fallbacks: 'default',
    });
    return stream.finalMessage();
  };
}

export const isApiError = (e: unknown): e is InstanceType<typeof Anthropic.APIError> => e instanceof Anthropic.APIError;
