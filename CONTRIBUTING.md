# Contributing to ai-coding-rules

Thanks for helping! The most valuable contributions are:

1. **A detector** for a stack you know (one file + one fixture + tests).
2. **A better rule pack** — concise, evidence-based rules only.
3. **False-positive reports** for `doctor`, with a minimal reproduction.
4. **Target format updates** when Cursor, Copilot, Claude Code, Codex or Gemini change their conventions.

By participating you agree to our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Setup

Requirements: Node.js ≥ 20 and npm.

```bash
git clone https://github.com/lehongphuong/ai-coding-rules
cd ai-coding-rules
npm ci
npm test
npm run dev -- scan            # run the CLI from source (tsx)
npm run build && node bin/ai-rules.js doctor
```

| script | what it does |
|---|---|
| `npm run dev -- <args>` | Run the CLI from TypeScript sources |
| `npm run build` | Bundle to `dist/` with tsup |
| `npm test` / `npm run test:watch` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` / `format:check` | Prettier |

CI runs typecheck, lint, tests and build on Linux, macOS and Windows, then runs `ai-rules check` on this repo itself.

## Architecture

[`SPEC.md`](./SPEC.md) is the technical contract; [`src/types.ts`](./src/types.ts) holds the shared types between modules. In short:

```
repo ─▶ scanner (detectors) ─▶ ProjectFacts ─▶ rule engine (packs) ─▶ RuleSet ─▶ renderers ─▶ writer (managed blocks)
instruction files ─▶ doctor parser ─▶ claims ─▶ checks ─▶ findings ─▶ reporters (human / json / sarif)
```

| dir | role |
|---|---|
| `src/core/` | File index, glob, hashing, fact helpers, known instruction files |
| `src/scanner/` | Detectors, workspaces, scripts → `scan()` |
| `src/rules/` | Rule packs → `buildRuleSet()` |
| `src/renderers/` | One renderer per target |
| `src/writer/` | Managed blocks, `planWrite`, `applyPlans` |
| `src/doctor/` | Parser, claims, checks → `runDoctor()` |
| `src/config/` | `.ai-rules/config.yaml` loader (zod) |
| `src/cli/` | Commands and reporters |
| `src/ai/` | Optional, opt-in LLM step — the **only** place allowed to make network calls |

Principles: deterministic output (no timestamps), pure detectors and checks, no network outside `src/ai/`, no telemetry.

## How to add…

### A detector

See [docs/writing-detectors.md](./docs/writing-detectors.md). Short version: add `src/scanner/detectors/<stack>.ts` exporting a `Detector`, read files only through the `FileIndex`, emit facts with evidence, register it, and add a fixture under `test/fixtures/<stack>/` plus tests.

### A rule pack

See [docs/writing-rule-packs.md](./docs/writing-rule-packs.md). Add a `RulePack` in `src/rules/`, register it, and test it against facts or a fixture. Follow the guidelines below.

### A doctor check

1. Add the id to `CheckId` in `src/types.ts` (coordinate in the PR — it's a shared contract).
2. Implement the check in `src/doctor/` as a pure function of the parsed instruction docs, claims, facts and config that returns `Finding[]` with a `hint` telling the user how to fix it.
3. If it needs new claims, extend the claim dictionary and add negation tests.
4. Add tests with a minimal "messy" fixture, including a case that must **not** fire.
5. Document it in [docs/doctor-checks.md](./docs/doctor-checks.md) (what, why, example, fix).

False positives erode trust faster than missed findings: when in doubt, don't report.

## Rule-writing guidelines

Enforced in review (SPEC §3.1):

1. **Each rule has at least one evidence item.** A rule without evidence is a bug; tests assert this for all fixtures.
2. **Imperative, ≤ 160 characters, no fluff.** "Use `pnpm` for all package commands; never use npm or yarn."
3. **Commands are rendered verbatim in backticks and come from `command` facts** — never invented.
4. **Do not claim conventions we can't evidence.**

Agents pay for every token: prefer fewer, sharper rules.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(scanner): detect Remix`, `fix(doctor): ignore negated yarn claims`, `docs: …`, `test: …`, `ci: …`, `chore: …`.
- One logical change per commit; keep PRs focused.
- Add tests and update snapshots deliberately (review the diff).
- Add a line to `CHANGELOG.md` under **Unreleased** for user-facing changes.
- Make sure `npm run typecheck && npm run lint && npm test` pass.

## Releasing (maintainers)

Bump the version in `package.json`, move the Unreleased changelog entries under the new version, then tag `vX.Y.Z` and push the tag. The release workflow publishes to npm with provenance and attaches standalone binaries to the GitHub release.
