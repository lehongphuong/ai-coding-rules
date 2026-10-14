# ai-coding-rules — Detailed Specification

This document is the technical contract for the project described in [PLAN.md](./PLAN.md).
Shared TypeScript types live in [`src/types.ts`](./src/types.ts) and are the single source of truth for module boundaries; this spec explains the behaviour behind them.

Decisions taken on the open questions in PLAN.md §12:

| Question | Decision |
|---|---|
| Package / CLI name | npm package `ai-coding-rules`; binaries `ai-coding-rules` **and** `ai-rules` (alias). |
| `CLAUDE.md` style | Default `claude.mode: import` → short file containing `@AGENTS.md` plus Claude-specific notes. `full` renders everything inline. |
| Source of truth | Repo facts + `.ai-rules/config.yaml` are the source. `AGENTS.md` and the rest are outputs. |
| CI strictness | `check` fails on `error` findings and out-of-date files. `--strict` (or `doctor.failOn: warning`) also fails on warnings. |

---

## 0. Brainstorm — feature ideas and what we keep

| Idea | Keep? | Notes |
|---|---|---|
| Evidence on every rule | ✅ core (D1) | Rules are generated from facts; facts carry evidence. |
| Multi-target compile | ✅ core (D2) | 5 targets in v1: agents, claude, cursor, copilot, gemini. Windsurf later. |
| Doctor: conflicts, stale, duplicates | ✅ core (D3, D4) | Claim extraction is dictionary-based and deterministic. |
| CI check + GitHub Action + pre-commit | ✅ (D5) | |
| Managed blocks / safe regen | ✅ (D6) | Hash detects hand edits inside managed blocks. |
| Monorepo scoped rules | ✅ (D7) | Nested `AGENTS.md`, Cursor `globs`, Copilot `applyTo`. |
| Token budget | ✅ (D8) | `chars / 4` heuristic; good enough and offline. |
| Optional LLM | ✅ opt-in (D9) | Ollama / Anthropic / OpenAI. Output marked `inferred`. |
| `explain` a rule | ✅ | Prints evidence trail. |
| `--verify` running detected commands | ⏭ later | Side effects + slow; tracked as a follow-up. |
| Auto-fix for doctor findings | ⏭ later | v1 prints hints; `generate` already fixes generated files. |
| SARIF output | ✅ | Enables GitHub code-scanning annotations. |
| Telemetry | ❌ | Never by default. |

---

## 1. Data model (see `src/types.ts`)

### 1.1 `Evidence`
`{ file, pointer?, line?, note? }` — `file` is a POSIX path relative to repo root. `pointer` is a JSON-pointer-ish locator such as `package.json#scripts.test` or `#dependencies.@nestjs/core`.

### 1.2 `Fact`
`{ key, value, confidence, evidence[], scope, meta? }`

- `scope` is the workspace directory (`""` = repo root, `"apps/mobile"` = a package).
- `confidence` ∈ [0, 1]. ≥ 0.9 = direct evidence (lockfile, dependency), 0.5–0.9 = heuristic (folder names).
- A key can have several facts (e.g. two `language` facts in a polyglot repo).

Fact keys and allowed values (non-exhaustive values are lowercase kebab ids):

| key | value examples | meta |
|---|---|---|
| `language` | typescript, javascript, dart, php, python, go, java, kotlin | `version?` |
| `framework` | react, nextjs, vue, nuxt, angular, svelte, nestjs, express, fastify, flutter, laravel, symfony, django, fastapi, flask, spring, android | `version?` |
| `packageManager` | npm, pnpm, yarn, bun, pub, composer, pip, poetry, uv, pipenv, go, gradle, maven | `version?` |
| `testRunner` | jest, vitest, mocha, playwright, cypress, flutter-test, phpunit, pest, pytest, go-test, junit | — |
| `linter` | eslint, biome, flutter-lints, very-good-analysis, phpstan, larastan, ruff, flake8, pylint, golangci-lint, ktlint, detekt | `config?` |
| `formatter` | prettier, biome, dart-format, pint, php-cs-fixer, black, ruff-format, gofmt, ktlint | `config?` |
| `typescriptStrict` | true / false | — |
| `command` | the full shell command, e.g. `pnpm test` | `kind` (install, dev, build, test, lint, format, typecheck, e2e, migrate), `name` |
| `orm` | prisma, typeorm, drizzle, mongoose, sequelize, eloquent, doctrine, sqlalchemy, django-orm, gorm, hibernate | — |
| `stateManagement` | riverpod, bloc, provider, getx, redux, zustand, pinia, mobx | — |
| `styling` | tailwind, css-modules, styled-components, sass | — |
| `ci` | github-actions, gitlab-ci, circleci, bitbucket-pipelines, azure-pipelines | — |
| `monorepo` | pnpm-workspaces, npm-workspaces, yarn-workspaces, turborepo, nx, lerna, melos, go-work | — |
| `runtime` | node, dart, php, python, go, java | `version` |
| `indent` | `2`, `4`, `tab` (from `.editorconfig`) | — |
| `agentFile` | path of an existing instruction file | `target` |

### 1.3 `ProjectFacts`
`{ root, name, description?, files, facts[], workspaces[], scripts[] }`

- `workspaces` always contains the root workspace `{ dir: "", name }` first.
- `scripts` = every invokable named command we know: npm/composer scripts, Makefile targets, `justfile` recipes, melos scripts. Used by `stale/command`.

### 1.4 `Rule` / `RuleSet`
`Rule = { id, section, text, scope, pack, evidence[], priority, inferred? }`

Sections (render order): `overview`, `commands`, `code-style`, `architecture`, `testing`, `dos-donts`, `security`.
`RuleSet = { project, rules[], scopes[] }`.

---

## 2. Scanner (`src/scanner/`)

### 2.1 File index
`createFsFileIndex(root, { ignore })` (in `src/core/file-index.ts`) walks the repo once:
- Respects root `.gitignore` plus built-in ignores: `node_modules, vendor, .git, dist, build, out, coverage, .dart_tool, .next, .nuxt, .venv, venv, __pycache__, target, .gradle, .idea, Pods, .turbo, .cache`.
- Caps: 50 000 paths, files > 1 MB are not read.
- Lazy, cached `read()`; `readJson()` returns `undefined` on parse errors (never throws).
- `createMemoryFileIndex(record)` provides the same API for tests.

### 2.2 Detectors
`Detector = { id, detect(ctx) => Fact[] }`, `ctx = { files, dir }`. Pure functions — no I/O except through `files`.

Required detectors (one file each in `src/scanner/detectors/`):

| file | detects |
|---|---|
| `node.ts` | language (ts/js), frameworks (react, nextjs, vue, nuxt, angular, svelte, nestjs, express, fastify), packageManager (lockfile → `packageManager` field → npm default), testRunner, linter/formatter (eslint, biome, prettier), typescriptStrict, orm (prisma, typeorm, drizzle, mongoose, sequelize), stateManagement (redux, zustand, pinia, mobx), styling (tailwind…), runtime (`engines.node`, `.nvmrc`), commands from scripts (prefixed with the right package manager: `pnpm test`, `npm run lint`, `yarn build`, `bun run dev`) |
| `flutter.ts` | `pubspec.yaml`: dart, flutter, pub, flutter-test, flutter-lints / very-good-analysis (`analysis_options.yaml`), state mgmt (riverpod, bloc, provider, getx), commands (`flutter pub get`, `flutter test`, `flutter analyze`, `dart format .`, `dart run build_runner build --delete-conflicting-outputs` when build_runner present) |
| `php.ts` | `composer.json`: php, composer, laravel (`laravel/framework` or `artisan`), symfony, phpunit / pest, phpstan / larastan, pint / php-cs-fixer, eloquent, commands (`composer install`, `php artisan test`, `./vendor/bin/pest`, `./vendor/bin/pint`, `php artisan migrate`) |
| `python.ts` | `pyproject.toml` / `requirements*.txt` / `Pipfile` / `uv.lock` / `poetry.lock`: python, django, fastapi, flask, pytest, ruff, black, flake8, sqlalchemy, packageManager |
| `go.ts` | `go.mod`: go, go-test, golangci-lint (`.golangci.yml`), gofmt, gorm, commands (`go test ./...`, `go build ./...`, `go vet ./...`) |
| `jvm.ts` | Gradle/Maven: java/kotlin, spring, android, junit, ktlint/detekt, commands (`./gradlew test`, `./gradlew build`, `mvn test`) |
| `tooling.ts` | `.editorconfig` indent, CI providers, Makefile/justfile presence, Docker |
| `agent-files.ts` | existing instruction files (see §6.1 list) as `agentFile` facts |

### 2.3 Workspaces (`src/scanner/workspaces.ts`)
Detect monorepos: `pnpm-workspace.yaml`, `package.json#workspaces` (array or `{packages}`), `turbo.json`, `nx.json`, `lerna.json`, `melos.yaml`, `go.work`. Expand simple globs (`apps/*`, `packages/**`) against the file index; a dir is a workspace if it contains a manifest (`package.json`, `pubspec.yaml`, `composer.json`, `pyproject.toml`, `go.mod`). Without a monorepo tool, any manifest found ≤ 2 levels deep in a dir **different** from root is also a workspace (covers "Flutter app + NestJS API" repos).

### 2.4 Scripts (`src/scanner/scripts.ts`)
Extract `ScriptDef[]` from `package.json#scripts`, `composer.json#scripts`, `Makefile` targets (`^name:` not starting with `.`), `justfile` recipes, `melos.yaml#scripts`.

### 2.5 `scan(root, opts): ProjectFacts`
Runs every detector for every workspace with `dir` set, de-duplicates identical `(key, value, scope)` facts (merging evidence), fills `name` (package.json name → pubspec name → composer name → folder name) and `description`.

---

## 3. Rule engine (`src/rules/`)

### 3.1 Packs
A pack is data + small functions:

```ts
interface RulePack {
  id: string;                         // "nestjs"
  appliesTo(q: FactQuery): boolean;   // q is scoped to one workspace
  rules: RuleTemplate[];
}
interface RuleTemplate {
  id: string;                         // globally unique, e.g. "nestjs/modules"
  section: SectionId;
  when?(q: FactQuery): boolean;
  text: string | ((q: FactQuery) => string);
  evidence: FactKey[] | ((q: FactQuery) => Evidence[]);
  priority?: number;                  // lower = earlier, default 50
}
```

Required packs: `common` (overview, commands, generic dos/don'ts, security), `typescript`, `javascript`, `react`, `nextjs`, `vue`, `nestjs`, `express`, `flutter`, `dart`, `laravel`, `php`, `python`, `django`, `fastapi`, `go`, `jvm` (spring/android/kotlin), `monorepo`.

Writing rules — guidelines enforced in review:
1. Each rule must have at least one evidence item. A rule without evidence is a bug (unit test asserts this for all fixtures).
2. Imperative, ≤ 160 chars, no fluff. ("Use `pnpm` for all package commands; never use npm or yarn.")
3. Commands are always rendered verbatim in backticks and come from `command` facts — never invented.
4. Do not claim conventions we can't evidence.

### 3.2 `buildRuleSet(facts, config): RuleSet`
- For every workspace, build a scoped `FactQuery` (root facts are inherited by child scopes only for `packageManager`, `ci`, `monorepo`, `indent`).
- Apply each pack where `appliesTo` is true; evaluate templates; drop rules listed in `config.rules.disable` (match by id or by pack id prefix `nestjs/*`).
- Append `config.rules.custom` (evidence: `.ai-rules/config.yaml`).
- Root scope rules that would be identical in a child scope are not duplicated into the child.
- Stable sort: scope ("" first), section order, priority, id.

---

## 4. Renderers (`src/renderers/`)

`Renderer = { target, render(ruleSet, ctx) => RenderedFile[] }`. Output is deterministic (no timestamps).

| target | files | layout |
|---|---|---|
| `agents` | `AGENTS.md` at root + `<scope>/AGENTS.md` per workspace with rules | `# <name>` header, one managed block per section with `## Heading` |
| `claude` | `CLAUDE.md` (root + per scope) | mode `import`: header + `@AGENTS.md` line + Claude-specific block (prefer running tests listed in Commands; keep `/memory` short). mode `full`: same sections as agents |
| `cursor` | `.cursor/rules/<scope-slug>-<section>.mdc` | front matter `description`, `globs` (`<scope>/**` for scoped; omitted for root), `alwaysApply: true` for root `overview`/`commands`/`code-style`, else `false` |
| `copilot` | `.github/copilot-instructions.md` (root rules), `.github/instructions/<scope-slug>.instructions.md` with front matter `applyTo: "<scope>/**"` | |
| `gemini` | `GEMINI.md` | same layout as agents |

Section headings: Overview → "Project overview", commands → "Commands", code-style → "Code style", architecture → "Architecture", testing → "Testing", dos-donts → "Do and don't", security → "Security".

Evidence rendering: `--with-evidence` (and config `output.evidence: comment`) appends `<!-- from: pnpm-lock.yaml -->` after each rule bullet. Default `none` keeps files lean; evidence is always available via `explain`.

## 5. Writer (`src/writer/`)

### 5.1 Managed block format
```md
<!-- ai-rules:begin id=commands hash=1a2b3c4d -->
## Commands
- ...
<!-- ai-rules:end id=commands -->
```
`hash` = first 8 hex chars of sha256 of the block body (between the markers, trimmed). The front matter of `.mdc`/`.instructions.md` files is always regenerated and placed before the first block.

### 5.2 `planWrite(file, existing) → WritePlan`
- `existing === undefined` → status `create`, content = frontMatter + header + blocks.
- Otherwise parse existing blocks. For each new block: replace in place if present; else append at end (before nothing — after the last managed block if any, else at end of file).
- Blocks present in file but no longer generated are removed (they were ours).
- If an existing block body's hash ≠ the hash in its marker → it was hand-edited → status `conflict` unless `force`.
- Content outside blocks is preserved byte-for-byte. Result identical to existing → `unchanged`.
- Every plan carries a unified diff (`diff` package) for `--diff`.

### 5.3 `applyPlans(root, plans, { dryRun })` creates directories and writes `create`/`update` plans; never writes `conflict`.

---

## 6. Doctor (`src/doctor/`)

### 6.1 Known instruction files
`AGENTS.md` (any depth), `CLAUDE.md`, `CLAUDE.local.md`, `.claude/CLAUDE.md` (any depth), `.cursorrules`, `.cursor/rules/**/*.mdc`, `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md`, `GEMINI.md`, `.windsurfrules`, `.windsurf/rules/**/*.md`. Patterns are in `src/core/agent-files.ts`.

### 6.2 Parser → `InstructionDoc`
`{ path, target, frontMatter?, lines[], sections[], text }` — `sections` = heading-delimited ranges with 1-based line numbers. Fenced code blocks are kept as-is but tagged so duplicate detection can ignore them if configured. Managed-block markers are recognised (`generated: true` on sections inside them).

### 6.3 Claims
`Claim = { key, value, file, line, text }`. Extracted with a pattern dictionary over each line (case-insensitive, word boundaries):

| key | patterns (examples) |
|---|---|
| `packageManager` | `npm (install|i|run|ci|test)`, `pnpm …`, `yarn …`, `bun …`, "use pnpm" |
| `testRunner` | jest, vitest, mocha, pytest, phpunit, pest, `flutter test`, `go test`, playwright, cypress — only when the line is about testing (contains test/spec or is under a heading containing "test") or is an imperative "use X" |
| `formatter` / `linter` | prettier, biome, eslint, ruff, black, pint, … |
| `indent` | "2 spaces", "4-space", "tabs for indentation" |
| `quotes` | "single quotes", "double quotes" |
| `semicolons` | "no semicolons", "always use semicolons" |
| `language` | "TypeScript only", "do not use JavaScript" |
| `command` | any backtick span starting with a known runner (`npm run x`, `pnpm x`, `yarn x`, `make x`, `just x`, `composer x`, `php artisan x`, `melos run x`) |
| `path` | backtick spans that look like repo paths (`src/…`, contain `/` and an extension or end with `/`) |

Negations ("don't use npm", "never use yarn", "instead of jest") produce a claim with `negated: true` and are **not** conflicts with an opposite fact.

### 6.4 Checks
| id | severity | logic |
|---|---|---|
| `conflict/repo` | error | non-negated claim for a single-valued key (`packageManager`, `testRunner`, `formatter`, `indent`) whose value contradicts the facts for that file's scope (scope = nearest workspace containing the file, root for root files). Only when the fact confidence ≥ 0.9 and the claimed value is **not** among the facts. |
| `conflict/files` | error | two files that apply to the same scope make different non-negated claims for `packageManager`, `testRunner`, `indent`, `quotes`, `semicolons`. |
| `stale/command` | warning | `npm run x`/`pnpm x`/`yarn x`/`make x`/… where `x` is not in `ProjectFacts.scripts` for that scope (built-ins like `pnpm install`, `npm test`, `yarn add` are allowed). |
| `stale/path` | warning | referenced path doesn't exist in the file index (glob-y paths with `*` skipped). |
| `duplicate` | warning | sections (≥ 3 non-empty lines) in **different** files with Jaccard similarity of 3-word shingles ≥ `doctor.duplicateThreshold` (default 0.8). Report both ranges and % similarity. Generated sections from the same generator are skipped when one file imports the other (`@AGENTS.md`). |
| `budget` | warning/info | per file > `budget.perFile` tokens (default 2000) → warning; per agent total (files the agent loads, see `AGENT_LOAD_MAP`) > `budget.perAgent` (default 6000) → warning; always emit an `info` summary line per agent. |
| `legacy` | info | `.cursorrules` → migrate to `.cursor/rules/*.mdc`; `.windsurfrules` → `.windsurf/rules/`. |
| `empty` | warning | instruction file with < 1 non-heading line. |

`Finding = { checkId, severity, message, file, line?, endLine?, related?, hint? }`, sorted by file, line.
`runDoctor(facts, config)` returns findings filtered by `config.doctor.disable`.

---

## 7. Config (`src/config/`)

File: `.ai-rules/config.yaml` (also accepts `.ai-rules.yaml`). Validated with zod; unknown keys → error with path. All keys optional.

```yaml
targets: [agents, claude, cursor, copilot, gemini]   # default: [agents, claude]
claude:
  mode: import          # import | full
output:
  evidence: none        # none | comment
ignore: ["legacy/**"]   # extra scan ignores
rules:
  disable: ["common/no-secrets", "nestjs/*"]
  custom:
    - id: team/pr-size
      section: dos-donts
      text: "Keep pull requests under 400 changed lines."
      scope: ""         # optional, default root
doctor:
  disable: ["budget"]
  failOn: error         # error | warning
  duplicateThreshold: 0.8
  budget: { perFile: 2000, perAgent: 6000 }
ai:
  provider: ollama      # ollama | anthropic | openai
  model: llama3.1
  baseUrl: http://localhost:11434
```

`loadConfig(root)` returns `ResolvedConfig` (all defaults filled) plus the path it was loaded from.

---

## 8. CLI (`src/cli/`)

Global flags: `--cwd <dir>`, `--json`, `--no-color`, `--quiet`.

| command | behaviour | exit |
|---|---|---|
| `init` | scan → print summary → interactive target selection (`@clack/prompts`; non-TTY or `--yes` uses defaults) → write `.ai-rules/config.yaml` if absent → generate. Never overwrites conflicting files without confirmation. | 0 |
| `scan` | print facts grouped by scope with evidence; `--json` dumps `ProjectFacts` minus `files`. | 0 |
| `generate` | `--target a,b`, `--dry-run`, `--diff`, `--force`, `--with-evidence`, `--ai`. Prints table path/status. | 0, 1 if conflicts |
| `doctor` | `--format human\|json\|sarif`, `--strict`. Human output groups by file, coloured severity, hints, then token summary. | 0 / 1 per failOn / 2 |
| `check` | doctor + generate dry-run; fails if any generated file would be `create`/`update`/`conflict` for configured targets, or doctor fails. Prints `run "ai-rules generate"` hint. | 0 / 1 / 2 |
| `explain <query>` | match rules by id (exact) or text (case-insensitive substring); print id, pack, scope, text, evidence list. | 0, 1 if no match |

Exit code 2 = unexpected error (message printed, stack with `DEBUG=ai-rules`).

Reporters (`src/cli/reporters/`): `human.ts`, `json.ts`, `sarif.ts` (SARIF 2.1.0, `ruleId = checkId`, level map error→error, warning→warning, info→note).

---

## 9. Optional AI (`src/ai/`) — opt-in only

- `--ai` on `generate` (and `init` when chosen). Never called otherwise; core must not import network code at module load.
- Providers via `fetch`: Ollama (`POST {baseUrl}/api/chat`), Anthropic Messages API (`ANTHROPIC_API_KEY`), OpenAI Chat Completions (`OPENAI_API_KEY`).
- Input: project summary (facts, top-level tree ≤ 200 entries, up to 5 sample source files ≤ 4 KB each). Never sends `.env*`, keys, or files matched by ignore.
- Output: JSON array of `{ section, text }` → `Rule` with `inferred: true`, `pack: "ai"`, evidence `{ file: "(ai)", note: model }`, max 15 rules. Invalid JSON → warn and return `[]`.
- Renderers suffix inferred rules with ` _(inferred)_`.

---

## 10. Integrations

- `action/action.yml` — composite GitHub Action: setup Node 20, `npx ai-coding-rules@<ref> check --format sarif > ai-rules.sarif`, optional upload via `github/codeql-action/upload-sarif`. Inputs: `version`, `args`, `sarif`.
- `.pre-commit-hooks.yaml` — hook id `ai-rules-check`.
- Release: `.github/workflows/release.yml` (npm publish on tag) and standalone binaries via `bun build --compile` for linux-x64, darwin-arm64, windows-x64.

---

## 11. Implementation tasks & ownership

Parallel work is split by directory so tasks never edit the same files. `src/types.ts`, `src/core/*`, `package.json`, configs are owned by the integrator (T0/T7).

| task | owner dir(s) | depends on (types only) | deliverable |
|---|---|---|---|
| T0 Scaffold | root configs, `src/types.ts`, `src/core/`, stubs | — | builds, tests run |
| T1 Scanner | `src/scanner/`, `test/scanner/`, `test/fixtures/` | types, core | `scan()` + 8 detectors + workspaces + scripts + fixtures for 6 stacks + monorepo |
| T2 Rule engine | `src/rules/`, `test/rules/` | types, core | `buildRuleSet()` + all packs |
| T3 Renderers + writer | `src/renderers/`, `src/writer/`, `test/renderers/`, `test/writer/` | types | 5 renderers, managed blocks, planWrite/applyPlans |
| T4 Doctor | `src/doctor/`, `test/doctor/` | types, core | parser, claims, 8 checks, `runDoctor()` |
| T5 CLI + config | `src/cli/`, `src/config/`, `test/cli/`, `test/config/` | all stubs | commands, reporters, config loader |
| T6 AI + integrations + docs | `src/ai/`, `test/ai/`, `action/`, `.pre-commit-hooks.yaml`, `.github/`, `docs/`, `CONTRIBUTING.md` | types | providers, enhance, action, workflows, docs |
| T7 Integration | everything | T1–T6 | merge, e2e tests on fixtures, dogfood own `AGENTS.md`, `check` in CI |

Definition of done per task: `npm run typecheck`, `npm run lint`, `npm test` green; public API matches `src/types.ts`/stubs; one commit per logical unit.
