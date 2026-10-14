# Configuration

`ai-rules` works with zero configuration. To customise it, create `.ai-rules/config.yaml` (also accepted: `.ai-rules/config.yml`, `.ai-rules.yaml`). `ai-rules init` writes one for you if it doesn't exist.

The file is validated on load: unknown keys and wrong types are errors that name the offending path (e.g. `doctor.failOn: expected "error" | "warning"`). Every key is optional.

## Full example

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

## Reference

### `targets`

List of output targets that `generate` writes and `check` verifies. Default `[agents, claude]`.

| target | files |
|---|---|
| `agents` | `AGENTS.md` at the root and `<workspace>/AGENTS.md` for each workspace with rules |
| `claude` | `CLAUDE.md` (root and per workspace) |
| `cursor` | `.cursor/rules/<scope>-<section>.mdc` |
| `copilot` | `.github/copilot-instructions.md` and `.github/instructions/<scope>.instructions.md` |
| `gemini` | `GEMINI.md` |

`generate --target a,b` overrides this list for one run.

### `claude.mode`

- `import` (default) — `CLAUDE.md` stays short: a line `@AGENTS.md` (Claude Code's import syntax) plus a few Claude-specific notes. Nothing is duplicated, so you don't pay for the same tokens twice.
- `full` — `CLAUDE.md` contains every section inline, like `AGENTS.md`. Use it if you don't generate `AGENTS.md` or prefer self-contained files.

### `output.evidence`

- `none` (default) — rules are rendered as plain bullets.
- `comment` — each bullet is followed by `<!-- from: pnpm-lock.yaml -->` naming its evidence. Same as `generate --with-evidence`.

Evidence is always available through `ai-rules explain`, whatever this setting is.

### `ignore`

Extra gitignore-style patterns excluded from the scan, on top of `.gitignore` and the built-in ignores (`node_modules`, `vendor`, `.git`, `dist`, `build`, `out`, `coverage`, `.dart_tool`, `.next`, `.nuxt`, `.venv`, `venv`, `__pycache__`, `target`, `.gradle`, `.idea`, `Pods`, `.turbo`, `.cache`).

### `rules.disable`

Rule ids to drop. Match an exact id (`common/no-secrets`) or a whole pack with `<pack>/*` (`nestjs/*`). Find ids with `ai-rules explain <text>` or `ai-rules generate --with-evidence`.

### `rules.custom`

Your own rules, rendered with the generated ones. Each entry:

| key | required | description |
|---|---|---|
| `id` | yes | Unique id, conventionally `team/<name>`. |
| `section` | yes | One of `overview`, `commands`, `code-style`, `architecture`, `testing`, `dos-donts`, `security`. |
| `text` | yes | One imperative line of Markdown. |
| `scope` | no | Workspace dir (`apps/api`); default `""` = repo root. |

Custom rules cite `.ai-rules/config.yaml` as their evidence.

### `doctor.disable`

Check ids to skip: `conflict/repo`, `conflict/files`, `stale/command`, `stale/path`, `duplicate`, `budget`, `legacy`, `empty`. See [doctor-checks.md](./doctor-checks.md).

### `doctor.failOn`

- `error` (default) — `doctor` / `check` exit 1 only on error findings.
- `warning` — warnings fail too. Same as passing `--strict`.

### `doctor.duplicateThreshold`

Jaccard similarity (0–1) of 3-word shingles above which two sections in different files are reported as duplicates. Default `0.8`.

### `doctor.budget`

Token estimates use `characters / 4`.

| key | default | meaning |
|---|---|---|
| `perFile` | `2000` | warn when one instruction file exceeds this |
| `perAgent` | `6000` | warn when all files one agent loads exceed this |

### `ai`

Enables the optional `--ai` step. Without this section `--ai` refuses to run. See [ai.md](./ai.md).

| key | default | description |
|---|---|---|
| `provider` | — (required) | `ollama`, `anthropic` or `openai` |
| `model` | `llama3.1` / `claude-opus-5-5` / `gpt-4o-mini` | Model name for the provider |
| `baseUrl` | provider default | Endpoint override (e.g. a remote Ollama, a proxy) |
