# AI Coding Rules

A local-first CLI that scans your project and generates **evidence-backed** instruction files for AI coding agents — `AGENTS.md`, `CLAUDE.md`, Cursor rules, GitHub Copilot instructions, `GEMINI.md` — and **lints** them for contradictions, duplicates and stale references.

- **Detects your stack**: React, Next.js, Vue, NestJS, Express, Flutter, Laravel, Django, FastAPI, Go, Spring/Android and more, including monorepos.
- **Every rule has evidence**: `Use pnpm` ← `pnpm-lock.yaml`. Nothing is invented; commands come from your real scripts.
- **One source, many targets**: edit once, every agent's file stays in sync.
- **`doctor`**: finds instructions that contradict each other or the repo, commands and paths that no longer exist, copy-pasted blocks and token bloat.
- **`check` for CI**: fails when instruction files are out of date or contradictory.
- **Safe regeneration**: generated content lives in managed blocks; your hand-written text is never touched.
- **Offline, no API key**: an LLM step is strictly opt-in (`--ai`, with Ollama, Anthropic or OpenAI).

> Status: early (v0.1). Design: [PLAN.md](./PLAN.md) · technical spec: [SPEC.md](./SPEC.md).

## Quick start

```bash
npx ai-coding-rules init        # scan, pick targets, write .ai-rules/config.yaml, generate
npx ai-coding-rules doctor      # lint every instruction file in the repo
```

The CLI is also available as `ai-rules` once installed (`npm i -D ai-coding-rules`).

## What it looks like

```text
$ ai-rules scan
root
  package manager : pnpm  (pnpm-lock.yaml)
  monorepo        : pnpm-workspaces  (pnpm-workspace.yaml#packages)
  ci              : github-actions  (.github/workflows/ci.yml)

apps/api (@acme/api)
  framework   : nestjs 10.4.0  (apps/api/package.json#dependencies.@nestjs/core)
  test runner : jest  (apps/api/package.json#devDependencies.jest)
  commands:
    test   pnpm --filter @acme/api test      (apps/api/package.json#scripts.test)
    e2e    pnpm --filter @acme/api test:e2e  (apps/api/package.json#scripts.test:e2e)
```

```text
$ ai-rules doctor
CLAUDE.md
  ✖ conflict/repo   CLAUDE.md:5   "Run `npm test` before every commit." — repo uses pnpm (pnpm-lock.yaml); package manager mismatch
  ✖ conflict/files  CLAUDE.md:6   test runner: says "jest" but .cursor/rules/testing.mdc:9 says "vitest"
  ⚠ duplicate       CLAUDE.md:8-18  CLAUDE.md:8-18 ≈ AGENTS.md:9-19 (93% similar)
    ↳ Keep it in one file and import it (e.g. `@AGENTS.md` in CLAUDE.md).
AGENTS.md
  ⚠ stale/command   AGENTS.md:6   `pnpm test:e2e` — script `test:e2e` is not defined in package.json
  ⚠ stale/path      AGENTS.md:7   references `src/legacy/` — no such file or directory

Tokens
  ℹ claude ≈ 159 tokens (CLAUDE.md 159)
```

## Commands

| command | what it does |
|---|---|
| `init` | Scan, choose targets, write `.ai-rules/config.yaml`, generate. |
| `scan` | Show detected facts with evidence (read-only). `--json` for tooling. |
| `generate` | Write instruction files. `--target`, `--dry-run`, `--diff`, `--force`, `--with-evidence`, `--ai`. |
| `doctor` | Lint all instruction files. `--format human\|json\|sarif`, `--strict`. |
| `check` | CI gate: doctor + "are generated files up to date?". |
| `explain <query>` | Show which files and facts a rule comes from. |

Full reference: [docs/commands.md](./docs/commands.md).

## Targets

| target | files |
|---|---|
| `agents` | `AGENTS.md` (root + one per workspace) |
| `claude` | `CLAUDE.md` — imports `@AGENTS.md` by default (`claude.mode: full` to inline) |
| `cursor` | `.cursor/rules/*.mdc` with `globs` / `alwaysApply` |
| `copilot` | `.github/copilot-instructions.md` + `.github/instructions/*.instructions.md` (`applyTo`) |
| `gemini` | `GEMINI.md` |

## CI

```yaml
- uses: lehongphuong/ai-coding-rules/action@main
  with:
    sarif: true   # annotate findings in pull requests
```

Or run `npx ai-coding-rules check` in any CI, or use the `ai-rules-check` pre-commit hook. See [docs/ci.md](./docs/ci.md).

## Documentation

- [Configuration](./docs/configuration.md)
- [Commands](./docs/commands.md)
- [Doctor checks](./docs/doctor-checks.md)
- [CI integration](./docs/ci.md)
- [Optional AI step](./docs/ai.md)
- [Writing detectors](./docs/writing-detectors.md) · [Writing rule packs](./docs/writing-rule-packs.md)

## Contributing

Contributions are welcome, especially new detectors, rule packs and doctor false-positive reports. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
