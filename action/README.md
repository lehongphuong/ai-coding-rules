# ai-coding-rules check — GitHub Action

Runs `ai-rules check` in your workflow. The step fails when:

- a generated instruction file (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/*.mdc`, …) is missing or out of date for the configured targets, or
- `doctor` reports findings at or above `doctor.failOn` (errors by default; warnings too with `--strict`).

## Usage

```yaml
name: ai-rules
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: lehongphuong/ai-coding-rules/action@v0
        with:
          version: latest      # npm version of ai-coding-rules
          args: --strict       # extra flags for `ai-rules check`
```

### Code-scanning annotations (SARIF)

```yaml
jobs:
  check:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write   # required to upload SARIF
    steps:
      - uses: actions/checkout@v4
      - uses: lehongphuong/ai-coding-rules/action@v0
        with:
          sarif: 'true'
```

With `sarif: 'true'` the action writes `ai-rules.sarif`, uploads it with `github/codeql-action/upload-sarif` (even when the check fails) and then fails the job with the original exit code. Findings show up as annotations on the pull request.

## Inputs

| input | default | description |
|---|---|---|
| `version` | `latest` | npm version of `ai-coding-rules` to run via `npx`. Pin it for reproducible builds. |
| `args` | `''` | Extra arguments for `ai-rules check`, e.g. `--strict`. |
| `sarif` | `'false'` | Write and upload SARIF for code scanning. |
| `working-directory` | `.` | Directory containing the repository root to check. |

## Outputs

| output | description |
|---|---|
| `exit-code` | `0` ok, `1` findings or out-of-date files, `2` unexpected error. |

The action needs no API key and makes no network calls besides installing the npm package (and the SARIF upload when enabled).

See [docs/ci.md](../docs/ci.md) for pre-commit and other CI systems.
