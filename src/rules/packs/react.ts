import type { RulePack } from '../pack.js';
import { allOf, ev } from './helpers.js';

const STATE_TEXT: Record<string, string> = {
  redux: 'Keep shared state in Redux slices; use local `useState` for component-only state.',
  zustand: 'Keep shared client state in Zustand stores; use local `useState` for component-only state.',
  mobx: 'Keep shared state in MobX stores and wrap reactive components with `observer`.',
};

const react = ev(['framework', 'react'], ['framework', 'nextjs']);

export const reactPack: RulePack = {
  id: 'react',
  appliesTo: (q) => q.has('framework', 'react') || q.has('framework', 'nextjs'),
  rules: [
    {
      id: 'react/function-components',
      section: 'code-style',
      priority: 60,
      text: 'Write function components with hooks; do not add class components.',
      evidence: react,
    },
    {
      id: 'react/hooks',
      section: 'code-style',
      priority: 61,
      text: 'Follow the Rules of Hooks: call hooks only at the top level of components and custom `use*` hooks.',
      evidence: react,
    },
    {
      id: 'react/state',
      section: 'architecture',
      priority: 20,
      text: (q) => {
        const s = q.values('stateManagement').find((v) => v in STATE_TEXT);
        return s ? STATE_TEXT[s]! : '';
      },
      evidence: (q) => q.all('stateManagement').filter((f) => String(f.value) in STATE_TEXT).flatMap((f) => f.evidence),
    },
    {
      id: 'react/testing-library',
      section: 'testing',
      priority: 40,
      text: 'Test components with React Testing Library; query by role or label, not implementation details.',
      evidence: allOf(ev('testRunner'), ev({ dep: '@testing-library/react' })),
    },
  ],
};
