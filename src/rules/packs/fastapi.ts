import type { RulePack } from '../pack.js';
import { allOf, ev } from './helpers.js';

const fastapi = ev(['framework', 'fastapi']);

export const fastapiPack: RulePack = {
  id: 'fastapi',
  appliesTo: (q) => q.has('framework', 'fastapi'),
  rules: [
    {
      id: 'fastapi/pydantic',
      section: 'architecture',
      priority: 10,
      text: 'Define request and response bodies as Pydantic models and set `response_model` on routes.',
      evidence: fastapi,
    },
    {
      id: 'fastapi/routers',
      section: 'architecture',
      priority: 20,
      text: 'Split endpoints into `APIRouter` modules per feature and include them in the app.',
      evidence: fastapi,
    },
    {
      id: 'fastapi/depends',
      section: 'architecture',
      priority: 30,
      text: 'Provide DB sessions, auth and settings through `Depends()` dependencies, not module-level globals.',
      evidence: fastapi,
    },
    {
      id: 'fastapi/async',
      section: 'dos-donts',
      priority: 20,
      text: 'Use `async def` endpoints only with non-blocking I/O; use plain `def` when calling blocking libraries.',
      evidence: fastapi,
    },
    {
      id: 'fastapi/test-client',
      section: 'testing',
      priority: 40,
      text: 'Test endpoints through `TestClient` and override dependencies with `app.dependency_overrides`.',
      evidence: allOf(fastapi, ev(['testRunner', 'pytest'])),
    },
  ],
};
