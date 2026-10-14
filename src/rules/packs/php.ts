import { displayName } from '../names.js';
import type { RulePack } from '../pack.js';
import { ev } from './helpers.js';

const STATIC_ANALYSERS = ['phpstan', 'larastan'];

export const phpPack: RulePack = {
  id: 'php',
  appliesTo: (q) => q.has('language', 'php'),
  rules: [
    {
      id: 'php/types',
      section: 'code-style',
      priority: 50,
      text: 'Declare parameter, property and return types on all new code; follow PSR-12.',
      evidence: ev(['language', 'php']),
    },
    {
      id: 'php/static-analysis',
      section: 'code-style',
      priority: 51,
      text: (q) => {
        const tool = q.values('linter').find((l) => STATIC_ANALYSERS.includes(l));
        return tool
          ? `Keep ${displayName(tool)} passing at the configured level; do not add new baseline entries.`
          : '';
      },
      evidence: (q) => STATIC_ANALYSERS.flatMap((l) => q.evidence('linter', l)),
    },
    {
      id: 'php/composer',
      section: 'dos-donts',
      priority: 20,
      text: 'Add dependencies with `composer require`; never edit files in `vendor/`.',
      evidence: ev(['packageManager', 'composer']),
    },
  ],
};
