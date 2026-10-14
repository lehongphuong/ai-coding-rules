import type { RulePack } from '../pack.js';
import type { FactQuery } from '../query.js';
import { ev } from './helpers.js';

const isVue2 = (q: FactQuery): boolean =>
  q
    .all('framework')
    .some((f) => f.value === 'vue' && (f.meta?.version ?? '').replace(/^\D*/, '').startsWith('2'));

const vue = ev(['framework', 'vue'], ['framework', 'nuxt']);

export const vuePack: RulePack = {
  id: 'vue',
  appliesTo: (q) => q.has('framework', 'vue') || q.has('framework', 'nuxt'),
  rules: [
    {
      id: 'vue/script-setup',
      section: 'code-style',
      priority: 60,
      when: (q) => !isVue2(q),
      text: (q) =>
        `Write components as SFCs with \`<script setup${q.has('language', 'typescript') ? ' lang="ts"' : ''}>\` and the Composition API.`,
      evidence: vue,
    },
    {
      id: 'vue/typed-props',
      section: 'code-style',
      priority: 61,
      when: (q) => !isVue2(q) && q.has('language', 'typescript'),
      text: 'Type props and events with `defineProps<...>()` and `defineEmits<...>()`.',
      evidence: ev(['framework', 'vue'], ['framework', 'nuxt'], ['language', 'typescript']),
    },
    {
      id: 'vue/nuxt',
      section: 'architecture',
      priority: 10,
      text: 'Rely on Nuxt auto-imports and file-based routing in `pages/`; do not register routes manually.',
      evidence: ev(['framework', 'nuxt']),
    },
    {
      id: 'vue/pinia',
      section: 'architecture',
      priority: 20,
      text: 'Keep shared state in Pinia stores (`defineStore`); do not add Vuex.',
      evidence: ev(['stateManagement', 'pinia']),
    },
  ],
};
