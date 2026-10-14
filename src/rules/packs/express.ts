import type { RulePack } from '../pack.js';
import { ev } from './helpers.js';

const express = ev(['framework', 'express']);

export const expressPack: RulePack = {
  id: 'express',
  // NestJS runs on Express; its own pack covers the architecture.
  appliesTo: (q) => q.has('framework', 'express') && !q.has('framework', 'nestjs'),
  rules: [
    {
      id: 'express/routers',
      section: 'architecture',
      priority: 10,
      text: 'Group routes per feature with `express.Router()`; keep handlers thin and move logic into services.',
      evidence: express,
    },
    {
      id: 'express/errors',
      section: 'architecture',
      priority: 20,
      text: 'Forward errors with `next(err)` and handle them in one central error-handling middleware.',
      evidence: express,
    },
    {
      id: 'express/validation',
      section: 'security',
      priority: 20,
      text: 'Validate `req.body`, `req.params` and `req.query` before use; never trust client input.',
      evidence: express,
    },
  ],
};
