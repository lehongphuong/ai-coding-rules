# Writing a detector

Detectors turn repository files into **facts with evidence**. They live in `src/scanner/detectors/`, one file per ecosystem (`node.ts`, `flutter.ts`, `php.ts`, `python.ts`, `go.ts`, `jvm.ts`, `tooling.ts`, `agent-files.ts`).

## Contract

```ts
import type { Detector, Fact } from '../../types.js';

export const rubyDetector: Detector = {
  id: 'ruby',
  detect({ files, dir }): Fact[] { /* ... */ },
};
```

- `files` is a read-only [`FileIndex`](../src/types.ts): `has`, `hasDir`, `read`, `readJson`, `glob`, `list`. All paths are POSIX and relative to the repo root.
- `dir` is the workspace being scanned (`""` = root, `"apps/api"` = a package). **Prefix every path with it** — use `joinPath(dir, 'Gemfile')` from `src/core`.
- Detectors are **pure**: no `fs`, no network, no `process.env`. Everything goes through `files`. This keeps them fast and trivially testable.
- Never throw. A malformed manifest means "no fact", not a crash (`readJson` already returns `undefined` on parse errors).

## Facts

```ts
{
  key: 'framework',            // a FactKey, see SPEC.md §1.2
  value: 'rails',              // lowercase kebab id
  confidence: 1,               // ≥ 0.9 direct evidence, 0.5–0.9 heuristic
  evidence: [{ file: joinPath(dir, 'Gemfile'), pointer: '#rails' }],
  scope: dir,
  meta: { version: '7.1' },    // optional
}
```

Guidelines:

- **Evidence is mandatory.** Point at the exact file and, when possible, a pointer (`package.json#devDependencies.vitest`) or line.
- **Confidence matters**: `doctor`'s `conflict/repo` check only trusts facts with confidence ≥ 0.9. Use lower values for guesses from folder names.
- **Commands** (`key: 'command'`) must be real, runnable commands, prefixed with the right tool (`pnpm test`, `bundle exec rspec`), with `meta.kind` (`install`, `dev`, `build`, `test`, `lint`, `format`, `typecheck`, `e2e`, `migrate`, `codegen`) and `meta.name`.
- Emit duplicates freely; the scanner merges identical `(key, value, scope)` facts and their evidence.
- If you add a new fact value (e.g. a new `testRunner`), check whether `doctor`'s claim dictionary in `src/doctor/` should learn it too.

## Register it

Add the detector to the list in `src/scanner/` (see `scan()`); it runs once per workspace. If the ecosystem has its own manifest (e.g. `Gemfile`), add it to the workspace manifest list so monorepo packages are found.

## Test it

1. Unit test with an in-memory index:

   ```ts
   import { createMemoryFileIndex } from '../../src/core/index.js';

   const files = createMemoryFileIndex({ 'Gemfile': "gem 'rails', '~> 7.1'\n" });
   expect(rubyDetector.detect({ files, dir: '' })).toContainEqual(
     expect.objectContaining({ key: 'framework', value: 'rails' }),
   );
   ```

2. Add a small but realistic fixture repo under `test/fixtures/<stack>/` and a scan test for it. Fixtures need only the files detectors read (manifests, lockfile names, config files) — keep them tiny.
3. Test the workspace case (`dir: 'apps/x'`) to catch missing path prefixes.

Then add or extend a [rule pack](./writing-rule-packs.md) so the new facts produce rules.
