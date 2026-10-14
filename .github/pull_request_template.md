## What

<!-- What does this change and why? Link related issues: "Fixes #123". -->

## Type

- [ ] Bug fix
- [ ] New detector / stack
- [ ] Rule pack change
- [ ] Doctor check
- [ ] Renderer / target format
- [ ] Docs / tooling

## Checklist

- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass
- [ ] Tests added or updated (fixtures for detectors, snapshots for renderers)
- [ ] Every new rule has evidence, is imperative and ≤ 160 characters ([guidelines](../CONTRIBUTING.md#rule-writing-guidelines))
- [ ] No network calls outside `src/ai/`
- [ ] `CHANGELOG.md` updated under "Unreleased" for user-facing changes
- [ ] Docs updated if behaviour, flags or config changed
