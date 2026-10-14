import type { RulePack } from '../pack.js';
import { allOf, dirEvidence, ev } from './helpers.js';

const go = ev(['language', 'go']);

export const goPack: RulePack = {
  id: 'go',
  appliesTo: (q) => q.has('language', 'go'),
  rules: [
    {
      id: 'go/errors',
      section: 'code-style',
      priority: 50,
      text: 'Return errors instead of panicking; wrap them with context using `fmt.Errorf("...: %w", err)`.',
      evidence: go,
    },
    {
      id: 'go/context',
      section: 'code-style',
      priority: 51,
      text: 'Pass `context.Context` as the first parameter of functions that do I/O or may block.',
      evidence: go,
    },
    {
      id: 'go/layout',
      section: 'architecture',
      priority: 10,
      text: 'Keep entrypoints in `cmd/<name>/` and non-exported packages in `internal/`.',
      evidence: allOf(
        (q) => dirEvidence(q, 'cmd'),
        (q) => dirEvidence(q, 'internal'),
      ),
    },
    {
      id: 'go/modules',
      section: 'dos-donts',
      priority: 20,
      text: 'Run `go mod tidy` after changing imports and commit `go.mod` with `go.sum`.',
      evidence: ev(['packageManager', 'go'], { file: 'go.mod' }),
    },
    {
      id: 'go/table-tests',
      section: 'testing',
      priority: 40,
      text: 'Write table-driven tests in `*_test.go` files next to the code they test.',
      evidence: ev(['testRunner', 'go-test']),
    },
  ],
};
