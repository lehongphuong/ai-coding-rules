import type { RulePack } from '../pack.js';
import { ev, pyExec } from './helpers.js';

const django = ev(['framework', 'django']);

export const djangoPack: RulePack = {
  id: 'django',
  appliesTo: (q) => q.has('framework', 'django'),
  rules: [
    {
      id: 'django/apps',
      section: 'architecture',
      priority: 10,
      text: 'Organise features as Django apps; keep business logic in models or services, not in views.',
      evidence: django,
    },
    {
      id: 'django/orm',
      section: 'architecture',
      priority: 20,
      text: 'Query through the Django ORM; use `select_related`/`prefetch_related` to avoid N+1 queries.',
      evidence: django,
    },
    {
      id: 'django/migrations',
      section: 'dos-donts',
      priority: 20,
      text: (q) =>
        `After changing models run \`${pyExec(q)}python manage.py makemigrations\` and commit the migration files.`,
      evidence: ev({ file: 'manage.py' }),
    },
    {
      id: 'django/settings-secrets',
      section: 'security',
      priority: 20,
      text: 'Read `SECRET_KEY`, credentials and `DEBUG` from environment variables; never hardcode them in settings.',
      evidence: django,
    },
  ],
};
