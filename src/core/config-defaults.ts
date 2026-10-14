import type { ResolvedConfig } from '../types.js';

export const CONFIG_PATHS = ['.ai-rules/config.yaml', '.ai-rules/config.yml', '.ai-rules.yaml'];

export function defaultConfig(): ResolvedConfig {
  return {
    targets: ['agents', 'claude'],
    claude: { mode: 'import' },
    output: { evidence: 'none' },
    ignore: [],
    rules: { disable: [], custom: [] },
    doctor: {
      disable: [],
      failOn: 'error',
      duplicateThreshold: 0.8,
      budget: { perFile: 2000, perAgent: 6000 },
    },
  };
}
