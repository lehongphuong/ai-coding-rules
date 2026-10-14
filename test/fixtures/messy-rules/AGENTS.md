# Agent instructions

## Commands

- Install dependencies with `pnpm install`.
- Run end-to-end tests with `pnpm test:e2e`.
- Old helpers live in `src/legacy/` and should not be imported.

## Code review checklist

- Keep functions small and focused on a single responsibility.
- Prefer composition over inheritance for shared behaviour.
- Validate all external input at the boundary of the system.
- Never log secrets, tokens or personal data.
- Write a failing test before fixing a reported bug.
- Keep pull requests under 400 changed lines whenever possible.
- Document every public function with a short doc comment.
- Remove dead code instead of commenting it out.
- Run the full test suite before pushing to the main branch.
