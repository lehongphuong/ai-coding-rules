import type { RulePack } from '../pack.js';
import { allOf, dirEvidence, ev } from './helpers.js';

const PM_TEXT: Record<string, string> = {
  uv: 'Add dependencies with `uv add` and run tools through `uv run` so the locked environment is used.',
  poetry: 'Add dependencies with `poetry add` and run tools through `poetry run`.',
  pipenv: 'Add dependencies with `pipenv install <pkg>` and run tools through `pipenv run`.',
};

export const pythonPack: RulePack = {
  id: 'python',
  appliesTo: (q) => q.has('language', 'python'),
  rules: [
    {
      id: 'python/type-hints',
      section: 'code-style',
      priority: 50,
      text: 'Add type hints to every function signature and public attribute.',
      evidence: ev(['language', 'python']),
    },
    {
      id: 'python/env-tool',
      section: 'dos-donts',
      priority: 20,
      text: (q) => {
        const pm = q.values('packageManager').find((p) => p in PM_TEXT);
        return pm ? PM_TEXT[pm]! : '';
      },
      evidence: (q) => Object.keys(PM_TEXT).flatMap((p) => q.evidence('packageManager', p)),
    },
    {
      id: 'python/pytest',
      section: 'testing',
      priority: 40,
      text: 'Write tests as plain `pytest` functions in `tests/` and share setup through fixtures, not `unittest.TestCase`.',
      evidence: allOf(ev(['testRunner', 'pytest']), (q) => dirEvidence(q, 'tests')),
    },
    {
      id: 'python/alembic',
      section: 'architecture',
      priority: 30,
      text: 'Change the database schema only through Alembic migrations; never edit a migration that has been applied.',
      evidence: ev({ file: 'alembic.ini' }),
    },
  ],
};
