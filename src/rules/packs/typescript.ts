import type { RulePack } from '../pack.js';
import type { FactQuery } from '../query.js';
import { ev, firstFile } from './helpers.js';

const strict = (q: FactQuery): boolean => q.has('typescriptStrict', true);
const usesJsx = (q: FactQuery): boolean => ['react', 'nextjs'].some((f) => q.has('framework', f));
const strictEvidence = ev(['typescriptStrict', true]);

export const typescriptPack: RulePack = {
  id: 'typescript',
  appliesTo: (q) => q.has('language', 'typescript'),
  rules: [
    {
      id: 'typescript/ts-only',
      section: 'code-style',
      priority: 10,
      when: (q) => !q.has('language', 'javascript'),
      text: (q) =>
        `Write new source files in TypeScript (${usesJsx(q) ? '`.ts`/`.tsx`' : '`.ts`'}); do not add new \`.js\` files.`,
      evidence: ev(['language', 'typescript']),
    },
    {
      id: 'typescript/no-any',
      section: 'code-style',
      priority: 20,
      when: strict,
      text: 'Do not use `any`; prefer `unknown` and narrow with type guards.',
      evidence: strictEvidence,
    },
    {
      id: 'typescript/no-ts-ignore',
      section: 'code-style',
      priority: 30,
      when: strict,
      text: 'Do not use `@ts-ignore`; fix the type error or use `@ts-expect-error` with a reason.',
      evidence: strictEvidence,
    },
    {
      id: 'typescript/keep-strict',
      section: 'dos-donts',
      priority: 30,
      when: strict,
      text: (q) =>
        `Keep \`strict\` enabled in \`${firstFile(q, ['tsconfig.json']) ?? 'tsconfig.json'}\`; never loosen compiler options to silence errors.`,
      evidence: strictEvidence,
    },
    {
      id: 'typescript/zod',
      section: 'code-style',
      priority: 40,
      text: 'Validate untrusted input (HTTP bodies, env, JSON) with zod schemas and derive types with `z.infer`.',
      evidence: ev({ dep: 'zod' }),
    },
  ],
};
