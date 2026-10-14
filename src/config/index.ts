import type { ResolvedConfig } from '../types.js';

export interface LoadedConfig {
  config: ResolvedConfig;
  /** Repo-relative path the config was read from, if any. */
  path?: string;
}

/** Load + validate config from `root`; defaults when absent. Throws ConfigError on invalid. (T5 — stub) */
export function loadConfig(_root: string): LoadedConfig {
  throw new Error('loadConfig: not implemented');
}
