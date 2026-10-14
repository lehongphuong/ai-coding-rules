import type { ProjectFacts, ResolvedConfig, Rule } from '../types.js';

export interface EnhanceOptions {
  /** Injected for tests; defaults to global fetch. */
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
}

/** Ask the configured LLM for extra inferred rules. Opt-in only. (T6 — stub) */
export async function enhanceWithAi(
  _facts: ProjectFacts,
  _config: ResolvedConfig,
  _options: EnhanceOptions = {},
): Promise<Rule[]> {
  throw new Error('enhanceWithAi: not implemented');
}
