# ai-coding-rules — Project Plan

> A local-first CLI that scans your repository and generates **accurate, evidence-backed instruction files** for AI coding agents (Claude Code, Cursor, GitHub Copilot, Codex, Gemini CLI, Windsurf…), then **keeps them consistent** with each other and with the code.

Status: **planning** · License: MIT · Contributions welcome (see [Contributing](#11-contributing))

---

## 1. Problem

Teams using AI coding agents end up with a pile of instruction files:

```
AGENTS.md
CLAUDE.md
.cursor/rules/*.mdc
.cursorrules                      (legacy)
.github/copilot-instructions.md
.github/instructions/*.instructions.md
GEMINI.md
.windsurf/rules/*.md
```

Common pain points:

1. **Writing them is tedious** — and most people copy a generic template that has nothing to do with their actual stack.
2. **They go stale** — the file says `npm test`, but the project moved to `pnpm` and Vitest six months ago.
3. **They drift apart** — `CLAUDE.md` says "use Jest", `.cursor/rules` says "use Vitest", Copilot instructions say nothing.
4. **They duplicate each other** — the same 40 lines pasted into 4 files, wasting context tokens and creating more places to forget to update.
5. **Existing generators** either need an LLM API key, send your code to a server, or produce boilerplate that ignores what is actually in the repo.

## 2. What makes this tool different

Plenty of "rules generators" exist. This project is only worth building if it does things they don't. Our differentiators:

| # | Feature | Why it matters |
|---|---------|----------------|
| D1 | **Evidence-backed rules** — every generated rule records *why* it exists (e.g. `Use pnpm` ← `pnpm-lock.yaml`; `Tests: vitest run` ← `package.json#scripts.test`). | Rules reflect the real repo, not a template. Users can audit and trust them. |
| D2 | **Single source of truth, many targets** — one canonical model compiles to every agent format. | Edit once, every tool stays in sync. |
| D3 | **Rules linter (`doctor`)** — detects duplicates, contradictions between files, and contradictions between files and the repo. | Nobody else checks whether your instructions are *true*. |
| D4 | **Stale reference detection** — commands, scripts, paths and packages mentioned in instruction files that no longer exist. | Catches rot automatically. |
| D5 | **Drift check for CI** — `ai-rules check` exits non-zero when files are out of date or contradictory. | Keeps rules healthy over time, like a linter for docs. |
| D6 | **Safe regeneration** — generated content lives in managed blocks; hand-written content outside them is never touched. | Users can customize without losing edits on regenerate. |
| D7 | **Monorepo aware** — per-package rules (nested `AGENTS.md`, Cursor `globs`, Copilot `applyTo`). | Flutter app + NestJS API in one repo get different rules. |
| D8 | **Token budget report** — estimated tokens per file and per agent. | Instruction bloat costs context on every request. |
| D9 | **100% local, deterministic, no API key** — LLM enhancement is strictly optional (local Ollama or user-provided key). | Works offline, in CI, and in companies that forbid sending code out. |

## 3. Goals and non-goals

**Goals (v1.0)**

- Detect the main stacks reliably: JS/TS (React, Next.js, Vue, NestJS, Express), Flutter/Dart, PHP (Laravel), Python (Django, FastAPI), Go, Java/Kotlin (Spring, Android).
- Generate: `AGENTS.md`, `CLAUDE.md`, Cursor rules, Copilot instructions, `GEMINI.md`.
- Lint existing instruction files for duplicates, conflicts and stale references.
- Run fully offline in < 2 s on a typical repo.
- Zero-config first run: `npx ai-coding-rules init`.

**Non-goals**

- Not a hosted service; no telemetry by default.
- Not a prompt library / marketplace of "best" prompts.
- Not an AI agent itself — it prepares context for agents.
- We will not guess style rules we cannot evidence (e.g. naming conventions) unless the user enables optional LLM analysis.

## 4. User experience

```bash
# First run: scan, show what was detected, ask before writing
npx ai-coding-rules init

# Show detected facts with evidence (read-only)
ai-rules scan
#   stack       : NestJS 10 (package.json → @nestjs/core)
#   language    : TypeScript, strict (tsconfig.json → compilerOptions.strict)
#   pkg manager : pnpm (pnpm-lock.yaml)
#   test        : Jest → `pnpm test` (package.json#scripts.test)
#   lint/format : ESLint + Prettier (eslint.config.mjs, .prettierrc)
#   database    : Prisma (prisma/schema.prisma)

# (Re)generate all configured targets
ai-rules generate [--target agents,claude,cursor,copilot] [--dry-run] [--diff]

# Lint existing instruction files
ai-rules doctor
#   ✖ conflict   CLAUDE.md:12 "run tests with npm test"
#                ↳ repo uses pnpm (pnpm-lock.yaml); package manager mismatch
#   ✖ conflict   .cursor/rules/testing.mdc:4 says "Vitest" vs AGENTS.md:30 says "Jest"
#   ⚠ stale      AGENTS.md:41 references script `test:e2e` — not in package.json
#   ⚠ duplicate  CLAUDE.md:20-38 ≈ AGENTS.md:15-33 (92% similar) — consider importing AGENTS.md
#   ℹ tokens     CLAUDE.md ≈ 2.4k · AGENTS.md ≈ 1.1k · total for Claude Code ≈ 3.5k

# CI mode: non-zero exit on errors or out-of-date generated files
ai-rules check

# Explain where a rule came from
ai-rules explain "Use pnpm"
```

Output formats: human (default), `--json` (for tooling), `--sarif` (GitHub code scanning annotations, later).

## 5. Architecture

```
            ┌────────────┐   ┌──────────────┐   ┌──────────────┐   ┌────────────┐
 repo ───▶  │  Scanner   │──▶│ ProjectFacts │──▶│  Rule Engine │──▶│ RuleSet    │
            │ (detectors)│   │ (+evidence)  │   │ (rule packs) │   │ (canonical)│
            └────────────┘   └──────────────┘   └──────────────┘   └─────┬──────┘
                                    ▲                                    │
                                    │                    ┌───────────────┼──────────────┐
            ┌────────────┐          │                    ▼               ▼              ▼
 existing ─▶│  Parser    │──▶ Claims ──▶ Doctor     AGENTS.md       CLAUDE.md     .cursor/…  (Renderers)
 rule files │ (md/mdc)   │          (lint engine)                                       │
            └────────────┘                                                              ▼
                                                                                 Writer (managed
                                                                                 blocks, diff, dry-run)
```

### 5.1 Scanner → `ProjectFacts`

- Walks the repo respecting `.gitignore`; skips `node_modules`, `vendor`, `build`, `.dart_tool`, etc.
- **Detectors** are small pure functions: `(fileIndex) => Fact[]`. Each fact carries `{ key, value, confidence, evidence: [{ file, pointer }] }`.
- Detector categories: language, framework, package manager, test runner, linters/formatters, build/run scripts, database/ORM, CI provider, monorepo layout (pnpm/npm workspaces, Turborepo, Nx, Melos, Composer path repos), existing agent files.
- Examples of evidence sources: `package.json`, lockfiles, `tsconfig.json`, `pubspec.yaml`, `analysis_options.yaml`, `composer.json`, `artisan`, `phpunit.xml`, `pyproject.toml`, `go.mod`, `build.gradle(.kts)`, `.github/workflows/*.yml`, `Makefile`, `.editorconfig`.

### 5.2 Rule Engine → canonical `RuleSet`

- **Rule packs** per stack (`packs/nestjs`, `packs/flutter`, `packs/laravel`…), written as data (YAML/TS) with conditions on facts:

  ```yaml
  id: pkg-manager
  when: { fact: packageManager }
  section: commands
  text: "Use {{packageManager}} for all dependency commands. Never mix package managers."
  ```
- Rules only fire when their facts exist → every rule is traceable (D1).
- Sections: *Project overview, Commands, Code style, Architecture, Testing, Do / Don't, Security*.
- User overrides in `.ai-rules/config.yaml` (disable a rule, add custom rules, choose targets).

### 5.3 Renderers (one per target)

| Target | Output | Notes |
|--------|--------|-------|
| `agents` | `AGENTS.md` (+ nested per package) | Primary canonical file; read by Codex and many others. |
| `claude` | `CLAUDE.md` | Default: short file that imports `@AGENTS.md` + Claude-specific notes, to avoid duplication. |
| `cursor` | `.cursor/rules/*.mdc` | Split by section, with `globs` / `alwaysApply` front matter. |
| `copilot` | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md` | `applyTo` globs for scoped rules. |
| `gemini` | `GEMINI.md` | |
| `windsurf` | `.windsurf/rules/*.md` | Later. |

Target format details change often, so each renderer is isolated and versioned, with snapshot tests.

### 5.4 Writer

- Generated content is wrapped in markers:
  ```md
  <!-- ai-rules:begin id=commands hash=3f2a… -->
  …generated…
  <!-- ai-rules:end -->
  ```
- Content outside markers is preserved verbatim (D6).
- If a managed block was hand-edited (hash mismatch), we warn and refuse to overwrite unless `--force`.
- `--dry-run` and `--diff` show changes before writing. `init` always asks before overwriting existing files.

### 5.5 Doctor (lint engine)

1. **Parse** every known instruction file into sections and lines (Markdown AST via `remark`; `.mdc` front matter via YAML).
2. **Extract claims** using a dictionary of normalized patterns, e.g. `packageManager=npm` from "npm install", `testRunner=jest` from "use Jest", `indent=2`, `quotes=single`, command references in backticks.
3. **Checks**
   - `conflict/repo` — claim ≠ detected fact (pnpm repo, file says npm).
   - `conflict/files` — two files make incompatible claims on the same key.
   - `stale/command` — referenced script/Make target/artisan command doesn't exist.
   - `stale/path` — referenced file or directory doesn't exist.
   - `duplicate` — near-duplicate blocks across files (shingling + Jaccard similarity, configurable threshold).
   - `budget` — file or per-agent total exceeds token budget.
   - `legacy` — deprecated formats (e.g. `.cursorrules`) with a migration hint.
4. Each check has an id, severity, and can be disabled in config. Exit codes: `0` ok, `1` errors, `2` tool failure.

### 5.6 Optional LLM enhancement (later, opt-in)

- `--ai` flag; providers: Ollama (local), Anthropic, OpenAI, via user-provided key.
- Uses: summarizing architecture from folder structure, inferring naming conventions from samples, rewriting rules more concisely.
- Output is marked as *inferred* (no hard evidence) and shown in a diff for approval. Core features never depend on it.

## 6. Tech stack

| Choice | Decision | Reason |
|--------|----------|--------|
| Language | **TypeScript** on Node.js ≥ 20 | Largest contributor pool; `npx` gives zero-install usage. |
| CLI framework | `commander` (or `citty`) + `@clack/prompts` for interactive init | Small, well-known. |
| Markdown | `unified` / `remark` | Robust AST for parsing existing files. |
| Globbing | `fast-glob` + `ignore` | Fast, respects `.gitignore`. |
| Tests | Vitest + fixture repos + snapshot tests | |
| Build | `tsup` | Single ESM bundle. |
| Distribution | npm (`npx ai-coding-rules`), later standalone binaries (`bun build --compile`) and Homebrew | Flutter/PHP devs may not have Node — binaries solve that. |
| CI integration | GitHub Action `ai-coding-rules/check` + pre-commit hook | |

## 7. Repository layout

```
ai-coding-rules/
├─ src/
│  ├─ cli/                 # commands: init, scan, generate, doctor, check, explain
│  ├─ scanner/
│  │  ├─ file-index.ts
│  │  └─ detectors/        # node.ts, flutter.ts, laravel.ts, python.ts, go.ts, ...
│  ├─ facts/               # ProjectFacts model + evidence types
│  ├─ rules/
│  │  ├─ engine.ts
│  │  └─ packs/            # common, typescript, react, nestjs, flutter, laravel, ...
│  ├─ renderers/           # agents, claude, cursor, copilot, gemini
│  ├─ writer/              # managed blocks, diff, safe write
│  ├─ doctor/
│  │  ├─ parser.ts
│  │  ├─ claims.ts
│  │  └─ checks/           # conflict, stale, duplicate, budget, legacy
│  └─ config/              # .ai-rules/config.yaml schema (zod)
├─ test/
│  ├─ fixtures/            # minimal real-world repos per stack + "messy" rule files
│  └─ snapshots/
├─ docs/                   # user docs, writing a detector, writing a rule pack
└─ action/                 # GitHub Action
```

## 8. Roadmap

### M0 — Foundations (week 1)
- Repo setup: TypeScript, tsup, Vitest, ESLint/Prettier, CI, release workflow (changesets).
- `README`, `CONTRIBUTING`, `CODE_OF_CONDUCT`, issue templates.
- Dogfood: generate this repo's own `AGENTS.md` with the tool as soon as possible.

### M1 — Scan (weeks 2–3) → `v0.1.0`
- File index, detector framework, `ProjectFacts` with evidence.
- Detectors: Node/TS (React, Next.js, NestJS, Express), Flutter/Dart, Laravel/PHP.
- `ai-rules scan` (human + `--json`).
- Fixture repos for each stack.

### M2 — Generate (weeks 3–5) → `v0.2.0`
- Rule engine + packs: common, typescript, react, nestjs, flutter, laravel.
- Renderers: `AGENTS.md`, `CLAUDE.md`.
- Writer with managed blocks, `--dry-run`, `--diff`.
- Interactive `init`.

### M3 — Doctor (weeks 5–7) → `v0.3.0`  ⭐ key differentiator
- Parser for all known instruction files.
- Claims extraction; checks: `conflict/repo`, `conflict/files`, `stale/command`, `stale/path`, `duplicate`, `budget`, `legacy`.
- `ai-rules explain`.

### M4 — More targets + CI (weeks 7–9) → `v0.4.0`
- Renderers: Cursor (`.mdc`), Copilot (repo + path-scoped), Gemini.
- `ai-rules check` for CI, GitHub Action, pre-commit hook, SARIF output.

### M5 — Monorepos + more stacks (weeks 9–11) → `v0.5.0`
- Workspace detection (pnpm/npm/yarn workspaces, Turborepo, Nx, Melos).
- Nested/scoped output per package.
- Detectors/packs: Python (Django, FastAPI), Go, Spring/Kotlin, Vue.

### M6 — Optional AI + polish (weeks 11–13) → `v1.0.0`
- `--ai` with Ollama / Anthropic / OpenAI providers.
- Standalone binaries, Homebrew tap.
- Docs site, demo GIF, launch post.

## 9. Testing strategy

- **Unit tests** for each detector and doctor check (input file map → expected facts/findings).
- **Fixture repos** under `test/fixtures/` — small but realistic projects per stack, plus "messy" repos with deliberately conflicting/stale instruction files.
- **Snapshot tests** for every renderer so format changes are visible in review.
- **Idempotency test**: `generate` twice → no diff; hand edits outside markers preserved.
- **Performance budget**: scan of a 10k-file repo < 2 s in CI.
- **Dogfooding**: this repo's own CI runs `ai-rules check` on itself.

## 10. Success metrics

- `init` produces useful files on the first run for the top 6 stacks without any config.
- `doctor` finds at least one real issue in most real-world repos that already have instruction files (validate on 20+ public repos before v1.0).
- Zero network calls unless `--ai` is passed.
- Community: contributed detectors/rule packs from people outside the core team.

## 11. Contributing

The easiest ways to help:

1. **Add a detector** for a stack you know (one file + one fixture + tests).
2. **Add or improve a rule pack** — concise, evidence-based rules only.
3. **Report false positives** from `doctor` with a minimal reproduction.
4. **Keep target formats up to date** when Cursor / Copilot / Claude Code / Codex change their conventions.

Guidelines: every rule must be justified by a fact; keep generated text short (agents pay for every token); no network calls in core code.

## 12. Open questions

- Package/binary name: `ai-coding-rules` on npm, `ai-rules` as the short CLI alias?
- Should `CLAUDE.md` import `@AGENTS.md` by default, or be fully rendered for users who don't want imports?
- Canonical source: is `AGENTS.md` itself the source of truth, or a separate `.ai-rules/` directory? (Proposal: facts + config are the source; `AGENTS.md` is an output.)
- How strict should `check` be by default in CI — fail on warnings or only errors?
