# ai-coding-rules

Generate evidence-backed instruction files for AI coding agents (AGENTS.md, CLAUDE.md, Cursor, Copilot, Gemini) and lint them for conflicts, duplicates and stale references. Local-first, no API key required.

<!-- ai-rules:begin id=overview hash=8ae17190 -->
## Project overview
- TypeScript (strict) project, managed with npm.
<!-- ai-rules:end id=overview -->

<!-- ai-rules:begin id=commands hash=272dc127 -->
## Commands
- Use `npm` for all dependency commands; do not use pnpm, yarn or bun.
- Install: `npm install`
- Dev: `npm run dev`
- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`
- Format: `npm run format`
- Typecheck: `npm run typecheck`
<!-- ai-rules:end id=commands -->

<!-- ai-rules:begin id=code-style hash=0aae1286 -->
## Code style
- Format with Prettier (`npm run format`) before committing.
- Write new source files in TypeScript (`.ts`); do not add new `.js` files.
- Lint with ESLint (`npm run lint`) and fix reported issues instead of disabling rules.
- Do not use `any`; prefer `unknown` and narrow with type guards.
- Indent with 2 spaces.
- Do not use `@ts-ignore`; fix the type error or use `@ts-expect-error` with a reason.
- Keep `npm run typecheck` passing; fix type errors instead of suppressing them.
- Validate untrusted input (HTTP bodies, env, JSON) with zod schemas and derive types with `z.infer`.
<!-- ai-rules:end id=code-style -->

<!-- ai-rules:begin id=architecture hash=2af48e21 -->
## Architecture
- Module boundaries are defined by `src/types.ts`; read SPEC.md before changing scanner, rules, renderers, writer or doctor.
<!-- ai-rules:end id=architecture -->

<!-- ai-rules:begin id=testing hash=fca37595 -->
## Testing
- Write tests with Vitest; do not introduce another test framework.
- Run `npm test` and make sure it passes before finishing a task.
- After changing rules or renderers, run `npm run build && node bin/ai-rules.js generate` and commit the regenerated files.
<!-- ai-rules:end id=testing -->

<!-- ai-rules:begin id=dos-donts hash=7f225f22 -->
## Do and don’t
- CI runs on GitHub Actions; keep it green and never skip failing checks.
- Keep `strict` enabled in `tsconfig.json`; never loosen compiler options to silence errors.
- Every generated rule must carry evidence; never add rules or commands that the repo cannot prove.
- Keep core code offline and deterministic; network calls belong only in `src/ai/` behind `--ai`.
<!-- ai-rules:end id=dos-donts -->
