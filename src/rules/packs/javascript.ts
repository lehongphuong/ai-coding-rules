import type { RulePack } from '../pack.js';
import type { FactQuery } from '../query.js';
import { ev } from './helpers.js';

function moduleType(q: FactQuery): string | undefined {
  const pkg = q.files.readJson<{ type?: unknown }>(q.path('package.json'));
  return typeof pkg?.type === 'string' ? pkg.type : undefined;
}

const js = ev(['language', 'javascript']);

export const javascriptPack: RulePack = {
  id: 'javascript',
  appliesTo: (q) => q.has('language', 'javascript') && !q.has('language', 'typescript'),
  rules: [
    {
      id: 'javascript/esm',
      section: 'code-style',
      priority: 10,
      when: (q) => moduleType(q) === 'module',
      text: 'Use ES modules (`import`/`export`); do not use `require` or `module.exports`.',
      evidence: (q) => [{ file: q.path('package.json'), pointer: '#type' }],
    },
    {
      id: 'javascript/const',
      section: 'code-style',
      priority: 20,
      text: 'Use `const` by default and `let` only when reassigning; never use `var`.',
      evidence: js,
    },
    {
      id: 'javascript/strict-equality',
      section: 'code-style',
      priority: 30,
      text: 'Use strict equality (`===`/`!==`) and document function parameters with JSDoc types.',
      evidence: js,
    },
  ],
};
