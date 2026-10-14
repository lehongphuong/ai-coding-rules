import type { RulePack } from '../pack.js';
import { allOf, dirEvidence, ev } from './helpers.js';

const laravel = ev(['framework', 'laravel']);

export const laravelPack: RulePack = {
  id: 'laravel',
  appliesTo: (q) => q.has('framework', 'laravel'),
  rules: [
    {
      id: 'laravel/artisan',
      section: 'architecture',
      priority: 10,
      text: 'Generate classes with `php artisan make:*` (models, controllers, requests, migrations) to follow conventions.',
      evidence: allOf(laravel, ev({ file: 'artisan' })),
    },
    {
      id: 'laravel/eloquent',
      section: 'architecture',
      priority: 20,
      text: 'Use Eloquent models and relationships instead of raw SQL; eager-load relations with `with()` to avoid N+1 queries.',
      evidence: ev(['orm', 'eloquent']),
    },
    {
      id: 'laravel/form-requests',
      section: 'architecture',
      priority: 30,
      text: 'Validate input in Form Request classes (`app/Http/Requests`), not inline in controllers.',
      evidence: laravel,
    },
    {
      id: 'laravel/migrations',
      section: 'dos-donts',
      priority: 20,
      text: 'Change the schema only with new migrations in `database/migrations/`; never edit migrations that already ran.',
      evidence: (q) => dirEvidence(q, 'database/migrations'),
    },
    {
      id: 'laravel/config',
      section: 'dos-donts',
      priority: 21,
      text: 'Read settings with `config()`; call `env()` only inside `config/*.php` files.',
      evidence: laravel,
    },
    {
      id: 'laravel/tests',
      section: 'testing',
      priority: 40,
      when: (q) => q.has('testRunner', 'pest') || q.has('testRunner', 'phpunit'),
      text: (q) =>
        q.has('testRunner', 'pest')
          ? 'Write Pest tests (`it()`/`test()`) in `tests/Feature` for HTTP flows and `tests/Unit` for isolated logic.'
          : 'Write PHPUnit tests in `tests/Feature` for HTTP flows and `tests/Unit` for isolated logic.',
      evidence: allOf(ev('testRunner'), (q) => dirEvidence(q, 'tests/Feature')),
    },
  ],
};
