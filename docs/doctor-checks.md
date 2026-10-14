# Doctor checks

`ai-rules doctor` parses every known instruction file, extracts *claims* from each line (package manager, test runner, formatter, indentation, quotes, semicolons, commands, paths…) with a deterministic pattern dictionary, and compares them with each other and with the facts detected in the repo.

Negated statements ("don't use npm", "never use yarn", "instead of jest") are recognised and never count as conflicting claims.

Disable a check in `.ai-rules/config.yaml`:

```yaml
doctor:
  disable: [budget, legacy]
```

| id | severity |
|---|---|
| [`conflict/repo`](#conflictrepo) | error |
| [`conflict/files`](#conflictfiles) | error |
| [`stale/command`](#stalecommand) | warning |
| [`stale/path`](#stalepath) | warning |
| [`duplicate`](#duplicate) | warning |
| [`budget`](#budget) | warning / info |
| [`legacy`](#legacy) | info |
| [`empty`](#empty) | warning |

---

## `conflict/repo`

**What:** an instruction file claims a package manager, test runner, formatter or indentation that contradicts the repo.

**Why:** an agent following the file runs the wrong tool — `npm install` in a pnpm repo creates a second lockfile.

**Example:**

```
✖ CLAUDE.md:12  conflict/repo  "Run tests with npm test" — repo uses pnpm (pnpm-lock.yaml)
```

Only reported when the repo fact has direct evidence (confidence ≥ 0.9) and the claimed value is not among the detected facts for that file's scope (the nearest workspace containing the file).

**Fix:** correct the line, or regenerate the file with `ai-rules generate`. If the detection is wrong, please [report a false positive](https://github.com/lehongphuong/ai-coding-rules/issues/new/choose).

## `conflict/files`

**What:** two files that apply to the same scope make different claims about `packageManager`, `testRunner`, `indent`, `quotes` or `semicolons`.

**Why:** different agents (or the same agent loading both files) receive contradicting instructions.

**Example:**

```
✖ .cursor/rules/testing.mdc:4  conflict/files  says "vitest", AGENTS.md:30 says "jest"
```

**Fix:** pick one and update the other file — or generate both from the same source with `ai-rules generate`.

## `stale/command`

**What:** a command such as `npm run x`, `pnpm x`, `yarn x`, `make x`, `just x`, `composer x`, `melos run x` references a script that is not defined for that scope (package.json / composer.json scripts, Makefile targets, justfile recipes, melos scripts). Built-ins like `pnpm install`, `npm test`, `yarn add` are allowed.

**Why:** agents waste turns running commands that don't exist.

**Example:**

```
⚠ AGENTS.md:41  stale/command  `pnpm test:e2e` — no script "test:e2e" in package.json
```

**Fix:** update the command or add the missing script.

## `stale/path`

**What:** a backticked repo path (`src/…`, or anything with a `/` and an extension or a trailing `/`) does not exist. Paths with `*` are skipped.

**Why:** agents look for files that were moved or deleted.

**Example:**

```
⚠ CLAUDE.md:18  stale/path  `src/utils/http.ts` does not exist
```

**Fix:** update or remove the reference.

## `duplicate`

**What:** two sections (≥ 3 non-empty lines) in different files whose 3-word shingle Jaccard similarity is ≥ `doctor.duplicateThreshold` (default 0.8). Generated sections are skipped when one file imports the other (`@AGENTS.md`).

**Why:** duplicated text costs context tokens on every request and drifts apart over time.

**Example:**

```
⚠ CLAUDE.md:20-38  duplicate  92% similar to AGENTS.md:15-33 — consider importing @AGENTS.md
```

**Fix:** keep the text in one place. For Claude Code, replace the copy with `@AGENTS.md` (`claude.mode: import`). Tune with `doctor.duplicateThreshold`.

## `budget`

**What:** estimated tokens (`chars / 4`) per file above `doctor.budget.perFile` (default 2000), or per agent — all files that agent loads — above `doctor.budget.perAgent` (default 6000). An `info` summary per agent is always emitted.

**Why:** every instruction token is paid on every request and crowds out code context.

**Example:**

```
⚠ CLAUDE.md  budget  ≈ 2,400 tokens (limit 2,000)
ℹ claude  budget  CLAUDE.md ≈ 2.4k · AGENTS.md ≈ 1.1k · total ≈ 3.5k
```

**Fix:** remove duplicated or generic text, move scoped rules into per-workspace files, or raise the limits.

## `legacy`

**What:** deprecated formats — `.cursorrules` (use `.cursor/rules/*.mdc`) and `.windsurfrules` (use `.windsurf/rules/*.md`).

**Why:** tools may stop reading them; the new formats support scoping.

**Fix:** generate the new format with `ai-rules generate --target cursor` and delete the legacy file, or disable the check.

## `empty`

**What:** an instruction file with no content besides headings.

**Why:** usually a leftover scaffold; it adds noise without guidance.

**Fix:** fill it in or delete it.
