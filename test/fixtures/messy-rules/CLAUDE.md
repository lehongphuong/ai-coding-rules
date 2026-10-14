# Messy rules

## Testing

- Run `npm test` before every commit.
- Use Jest for all unit tests.

## Code review checklist

- Keep functions small and focused on a single responsibility.
- Prefer composition over inheritance for shared behaviour.
- Validate all external input at the boundary of the system.
- Never log secrets, tokens or personal data.
- Write a failing test before fixing a reported bug.
- Keep pull requests under 400 changed lines when possible.
- Document every public function with a short doc comment.
- Remove dead code instead of commenting it out.
- Run the full test suite before pushing to the main branch.
