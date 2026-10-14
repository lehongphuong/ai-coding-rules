# Commands

```bash
npx ai-coding-rules <command> [options]   # or, once installed: ai-rules <command>
```

Both binaries, `ai-coding-rules` and `ai-rules`, are the same program.

## Global flags

| flag | description |
|---|---|
| `--cwd <dir>` | Run as if started in `<dir>` (the repository root). |
| `--json` | Machine-readable output where supported. |
| `--no-color` | Disable colours (also honours `NO_COLOR`). |
| `--quiet` | Print only errors and the final result. |

## Exit codes

| code | meaning |
|---|---|
| `0` | Success. |
| `1` | The command ran but found a problem: findings at or above the fail level, out-of-date files, write conflicts, or no match for `explain`. |
| `2` | Usage error (unknown command, option or target) or unexpected error (bad config, crash). The message is printed; set `DEBUG=ai-rules` for a stack trace. |

## `init`

Scans the repo, prints what it detected, asks which targets to generate (interactive prompt; non-TTY or `--yes` uses the defaults), writes `.ai-rules/config.yaml` if it doesn't exist, then generates the files. It never overwrites a file with hand-edited managed blocks without asking.

| flag | description |
|---|---|
| `--yes` | Accept defaults, no prompts. |
| `--target <list>` | Comma-separated targets; skips the selection prompt. |
| `--ai` | Also run the optional AI step (needs an `ai:` config section). |
| `--dry-run` | Show what would be generated without writing anything. |

Exit: `0`, or `1` if conflicting files were left untouched.

## `scan`

Prints detected facts grouped by scope (root, then each workspace) with their evidence. Read-only.

`--json` dumps the project facts (without the file index).

Exit: `0`.

## `generate`

Builds the rule set and writes the configured targets. Generated content lives in managed blocks; text outside them is preserved byte-for-byte. Prints a table of paths and statuses (`create`, `update`, `unchanged`, `conflict`).

| flag | description |
|---|---|
| `--target a,b` | Targets for this run (`agents`, `claude`, `cursor`, `copilot`, `gemini`). |
| `--dry-run` | Show what would change; write nothing. |
| `--diff` | Print a unified diff per file. |
| `--force` | Overwrite managed blocks that were edited by hand. |
| `--with-evidence` | Append `<!-- from: … -->` after each rule. |
| `--ai` | Add inferred rules from the configured LLM ([ai.md](./ai.md)). |

Exit: `0`, or `1` if any file is in `conflict` (a managed block was edited by hand; re-run with `--force` or move your edits outside the block).

## `doctor`

Lints every known instruction file (`AGENTS.md`, `CLAUDE.md`, `CLAUDE.local.md`, `.claude/CLAUDE.md`, `.cursorrules`, `.cursor/rules/**/*.mdc`, `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md`, `GEMINI.md`, `.windsurfrules`, `.windsurf/rules/**/*.md`) against each other and against the repo. See [doctor-checks.md](./doctor-checks.md).

| flag | description |
|---|---|
| `--format human\|json\|sarif` | Output format. Human output groups findings by file, then prints a token summary. SARIF 2.1.0 is for GitHub code scanning. |
| `--strict` | Fail on warnings too (same as `doctor.failOn: warning`). |

Exit: `0` clean, `1` findings at or above the fail level, `2` error.

## `check`

For CI. Runs `doctor` and a `generate` dry run. Fails when any configured target file would be created, updated or is in conflict, or when `doctor` fails. Prints a hint to run `ai-rules generate`.

Accepts the `doctor` flags (`--format`, `--strict`). Out-of-date files are reported as `outdated` error findings, so they also show up in JSON and SARIF output.

Exit: `0` / `1` / `2`.

## `explain <query>`

Finds rules by id (exact) or text (case-insensitive substring) and prints id, pack, scope, text and the evidence trail.

```bash
ai-rules explain "Use pnpm"
ai-rules explain nestjs/modules
```

Exit: `0`, or `1` if nothing matches.
