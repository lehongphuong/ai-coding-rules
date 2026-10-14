import type { RulePack } from '../pack.js';
import type { FactQuery } from '../query.js';
import { dirEvidence, ev } from './helpers.js';

/** Router directory in use, e.g. "app" or "src/pages". */
function routerDir(q: FactQuery, kind: 'app' | 'pages'): string | undefined {
  return [kind, `src/${kind}`].find((d) => q.files.hasDir(q.path(d)));
}

const routerEvidence = (kind: 'app' | 'pages') => (q: FactQuery) => {
  const dir = routerDir(q, kind);
  return dir ? dirEvidence(q, dir) : [];
};

const next = ev(['framework', 'nextjs']);

export const nextjsPack: RulePack = {
  id: 'nextjs',
  appliesTo: (q) => q.has('framework', 'nextjs'),
  rules: [
    {
      id: 'nextjs/app-router',
      section: 'architecture',
      priority: 10,
      text: (q) =>
        `Use the App Router (\`${routerDir(q, 'app')}/\`); components are Server Components by default, add \`'use client'\` only when needed.`,
      evidence: routerEvidence('app'),
    },
    {
      id: 'nextjs/pages-router',
      section: 'architecture',
      priority: 10,
      when: (q) => !routerDir(q, 'app'),
      text: (q) =>
        `Routes use the Pages Router (\`${routerDir(q, 'pages')}/\`); do not mix in App Router files.`,
      evidence: routerEvidence('pages'),
    },
    {
      id: 'nextjs/link-image',
      section: 'code-style',
      priority: 70,
      text: 'Use `next/link` for internal navigation and `next/image` for images instead of `<a>`/`<img>`.',
      evidence: next,
    },
    {
      id: 'nextjs/env',
      section: 'security',
      priority: 20,
      text: 'Expose env vars to the browser only with the `NEXT_PUBLIC_` prefix; keep secrets server-side.',
      evidence: next,
    },
  ],
};
