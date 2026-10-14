# CI integration

`ai-rules check` is built for CI. It exits non-zero when:

- a generated file for a configured target would be created, updated, or is in conflict (someone changed the stack or hand-edited a managed block and didn't regenerate), or
- `doctor` reports findings at or above `doctor.failOn` (errors by default; add `--strict` to fail on warnings).

It needs no API key and makes no network calls.

## GitHub Action

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
          version: latest
          args: --strict
```

Inputs: `version` (default `latest`), `args` (default empty), `sarif` (default `'false'`), `working-directory` (default `.`).

### Annotations via code scanning

Set `sarif: 'true'` and grant `security-events: write`. The action writes `ai-rules.sarif`, uploads it with `github/codeql-action/upload-sarif` even when the check fails, and then fails the job with the original exit code.

```yaml
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: lehongphuong/ai-coding-rules/action@v0
        with:
          sarif: 'true'
```

Details: [action/README.md](../action/README.md).

## pre-commit

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/lehongphuong/ai-coding-rules
    rev: v0.1.0
    hooks:
      - id: ai-rules-check
```

The hook runs `ai-rules check` once per commit (`always_run: true`, no file names passed).

Prefer a plain git hook? Add to `.husky/pre-commit` or `.git/hooks/pre-commit`:

```sh
npx --yes ai-coding-rules check
```

## Other CI systems

Any runner with Node.js ≥ 20:

```sh
npx --yes ai-coding-rules@latest check
```

GitLab CI:

```yaml
ai-rules:
  image: node:22
  script:
    - npx --yes ai-coding-rules@latest check --strict
```

No Node.js? Download the standalone binary for your platform from the [GitHub releases](https://github.com/lehongphuong/ai-coding-rules/releases) (`ai-rules-linux-x64`, `ai-rules-darwin-arm64`, `ai-rules-windows-x64.exe`) and run `./ai-rules-linux-x64 check`.

Machine-readable output: `ai-rules check --format json` or `--format sarif`.

## When `check` fails

Run locally:

```sh
npx ai-coding-rules generate --diff   # update generated files
npx ai-coding-rules doctor            # see findings with hints
```

Commit the result. Exit codes: `0` ok, `1` out-of-date or findings, `2` unexpected error.
