// Whether real Claude agents run, and with what limits. Everything comes from environment
// variables so the Vercel project settings are the control panel.
import type Anthropic from '@anthropic-ai/sdk';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AgentConfig {
  model: string;
  effort: Effort;
  /** Turns stop for the day once estimated spend reaches this. */
  dailyBudgetUsd: number;
  /** A task that hasn't finished after this many model calls fails. */
  maxTurns: number;
  /**
   * How long one POST /api/work keeps starting new turns. A turn already started may run
   * another MODEL_TIMEOUT_MS, and the two must fit in the function's lifetime (300 s on Vercel).
   */
  workMs: number;
}

/** One model call. Injected so tests can script the model's replies. */
export type CallModel = (params: Anthropic.Beta.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.BetaMessage>;

export type Agents =
  | { enabled: true; config: AgentConfig; callModel: CallModel }
  | { enabled: false; reason: string };

const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** Longest a single model call may take before it's abandoned and retried. */
export const MODEL_TIMEOUT_MS = 170_000;

function num(v: string | undefined, fallback: number, min: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

export function readAgentConfig(env: Record<string, string | undefined>): AgentConfig {
  return {
    model: env.AGENT_MODEL?.trim() || 'claude-opus-5-5',
    effort: EFFORTS.includes(env.AGENT_EFFORT as Effort) ? (env.AGENT_EFFORT as Effort) : 'medium',
    dailyBudgetUsd: num(env.AGENT_DAILY_BUDGET_USD, 5, 0),
    maxTurns: num(env.AGENT_MAX_TURNS, 40, 1),
    workMs: num(env.AGENT_WORK_SECONDS, 120, 10) * 1000,
  };
}

/**
 * Real agents need an API key, and (unless explicitly allowed) a write token: otherwise
 * anyone who finds the URL could spend your API credits by assigning tasks.
 */
export function agentsFromEnv(env: Record<string, string | undefined>, opts: { requireToken: boolean; makeCaller: (apiKey: string) => CallModel }): Agents {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return { enabled: false, reason: 'Set ANTHROPIC_API_KEY to give employees real Claude agents.' };
  if (opts.requireToken && !env.OFFICE_TOKEN && env.AGENTS_ALLOW_PUBLIC !== '1') {
    return { enabled: false, reason: 'ANTHROPIC_API_KEY is set, but agents stay simulated until OFFICE_TOKEN is set too, so strangers can’t spend your credits.' };
  }
  return { enabled: true, config: readAgentConfig(env), callModel: opts.makeCaller(apiKey) };
}
