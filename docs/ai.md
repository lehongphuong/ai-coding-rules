# Optional AI enhancement

Everything in `ai-rules` works offline and deterministically. The AI step is **strictly opt-in**: it adds a handful of *inferred* rules — naming, folder structure, recurring patterns — that can't be proven from manifests alone.

It runs only when **both** are true:

1. you pass `--ai` to `generate` (or choose it during `init`), and
2. `.ai-rules/config.yaml` has an `ai:` section.

Without `--ai`, no network call is ever made.

## Providers

```yaml
ai:
  provider: ollama      # ollama | anthropic | openai
  model: llama3.1       # optional
  baseUrl: http://localhost:11434   # optional
```

| provider | default model | credentials | endpoint |
|---|---|---|---|
| `ollama` | `llama3.1` | none | `http://localhost:11434/api/chat` (override with `ai.baseUrl`) |
| `anthropic` | `claude-opus-5-5` | `ANTHROPIC_API_KEY` | `https://api.anthropic.com/v1/messages` (override with `ai.baseUrl` or `ANTHROPIC_BASE_URL`) |
| `openai` | `gpt-4o-mini` | `OPENAI_API_KEY` | `https://api.openai.com/v1/chat/completions` (override with `ai.baseUrl` or `OPENAI_BASE_URL`) |

`ollama` keeps everything on your machine. The OpenAI provider works with any OpenAI-compatible Chat Completions server that supports `response_format: json_object` via `OPENAI_BASE_URL`.

Requests time out after 60 seconds. A missing key, a timeout or a non-2xx response stops the command with a clear error; nothing is written.

```bash
ollama pull llama3.1
ai-rules generate --ai --dry-run --diff   # review before writing
```

## What the output looks like

The model must answer with JSON: `{"rules":[{"section":"…","text":"…"}]}`. The answer is parsed defensively:

- at most 15 rules, each trimmed to 200 characters;
- unknown sections and duplicates are dropped;
- `commands` rules are dropped — commands always come from detected facts, never from a model;
- an unusable answer prints a warning and adds no rules.

Accepted rules get ids `ai/1`, `ai/2`, …, pack `ai`, evidence `(ai)` with the provider and model, and are rendered with an ` _(inferred)_` suffix so readers know they are not backed by hard evidence. Disable them like any other rule (`rules.disable: ["ai/*"]`) or simply don't pass `--ai`.

## Privacy: what is sent

Only a compact project summary:

- the project name and description;
- detected facts as `key=value` lines per workspace (languages, frameworks, tools, commands);
- the top of the file tree: at most 200 entries, collapsed to two levels (`src/users/`);
- up to 5 sample source files, preferring entry points (`src/main.ts`, `lib/main.dart`, `app/Http/Kernel.php`, `main.go`, …), each cut to 4 KB.

## What is never sent

- Files ignored by `.gitignore`, the built-in ignores or `ignore:` in config — they are never even indexed.
- Secret-looking files, by name: `.env*`, `*.pem`, `*.key`, `id_rsa*` (and other SSH keys), anything with `secret` in its path, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `credentials*`, `.npmrc`, `.pypirc`, `.netrc`, `auth.json`, `service-account*.json`, and anything under `.ssh/`, `.aws/`, `.gnupg/`. They are left out of both the tree and the samples.
- Lines that look like secret assignments — matching `api_key`, `apikey`, `api-key`, `secret`, `token` or `password` followed by `:` or `=` — are replaced with `[redacted]` in samples and facts.
- The contents of your existing instruction files, git history, and environment variables.

Redaction is a safety net, not a guarantee. If your code base may not leave your network, use `ollama` (or don't use `--ai`). Run `ai-rules generate --ai --dry-run` against a local model first if you want to inspect the result.
