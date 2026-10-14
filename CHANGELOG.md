# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `scan`: detects languages, frameworks, package managers, test runners, linters/formatters, ORMs, state management, styling, CI, runtimes and commands for JS/TS (React, Next.js, Vue, NestJS, Express…), Flutter/Dart, PHP (Laravel, Symfony), Python (Django, FastAPI, Flask), Go and JVM (Spring, Android, Kotlin) — every fact with evidence.
- Monorepo support: pnpm/npm/yarn workspaces, Turborepo, Nx, Lerna, Melos, `go.work`, plus multi-stack repos without a monorepo tool.
- `generate`: evidence-backed rules rendered to `AGENTS.md`, `CLAUDE.md` (import or full mode), Cursor `.mdc` rules, Copilot instructions and `GEMINI.md`, with per-workspace scoping.
- Safe regeneration with managed blocks: hand-written text is preserved, hand-edited blocks are reported as conflicts; `--dry-run`, `--diff`, `--force`, `--with-evidence`.
- `doctor`: `conflict/repo`, `conflict/files`, `stale/command`, `stale/path`, `duplicate`, `budget`, `legacy` and `empty` checks; human, JSON and SARIF output.
- `check` for CI, `explain` to show where a rule comes from, interactive `init`.
- `.ai-rules/config.yaml`: targets, Claude mode, evidence comments, ignores, disabled/custom rules, doctor settings.
- Optional, opt-in `--ai` enhancement with Ollama, Anthropic or OpenAI; inferred rules are marked as such, and secret files are never sent.
- GitHub Action (with SARIF upload), pre-commit hook, CI and release workflows with standalone binaries.
- Documentation: configuration, commands, doctor checks, CI, AI, writing detectors and rule packs.
