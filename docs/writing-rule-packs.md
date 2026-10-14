# Writing a rule pack

Rule packs turn facts into the rules that end up in `AGENTS.md`, `CLAUDE.md` and friends. They live in `src/rules/` (one pack per stack: `common`, `typescript`, `react`, `nestjs`, `flutter`, `laravel`, …).

## Shape

```ts
interface RulePack {
  id: string;                         // "nestjs"
  appliesTo(q: FactQuery): boolean;   // q is scoped to one workspace
  rules: RuleTemplate[];
}

interface RuleTemplate {
  id: string;                         // globally unique: "nestjs/modules"
  section: SectionId;                 // overview | commands | code-style | architecture | testing | dos-donts | security
  when?(q: FactQuery): boolean;       // extra condition
  text: string | ((q: FactQuery) => string);
  evidence: FactKey[] | ((q: FactQuery) => Evidence[]);
  priority?: number;                  // lower = earlier in the section, default 50
}
```

`FactQuery` gives read access to the facts of one workspace. Root facts are inherited by child workspaces only for `packageManager`, `ci`, `monorepo` and `indent`.

## Example

```ts
export const railsPack: RulePack = {
  id: 'rails',
  appliesTo: (q) => q.has('framework', 'rails'),
  rules: [
    {
      id: 'rails/tests',
      section: 'testing',
      when: (q) => q.has('testRunner', 'rspec'),
      text: 'Write specs with RSpec under `spec/`; do not add Minitest tests.',
      evidence: ['testRunner'],
    },
  ],
};
```

Register the pack in the pack list in `src/rules/`.

## How packs are applied

For each workspace, every pack whose `appliesTo` is true contributes its templates (filtered by `when`). Rules listed in `rules.disable` are dropped (`rails/tests` or `rails/*`), custom rules from config are appended, root rules are not repeated in child scopes, and the result is sorted by scope, section, priority and id — so output is deterministic.

## Rule-writing guidelines

These are enforced in review:

1. **Every rule has evidence.** A rule without evidence is a bug — tests assert this for all fixtures.
2. **Imperative, ≤ 160 characters, no fluff.** "Use `pnpm` for all package commands; never use npm or yarn."
3. **Commands come from `command` facts**, rendered verbatim in backticks. Never invent a command.
4. **Don't claim conventions you can't evidence.** No naming or style rules unless a fact (config file, linter preset) proves them.

Also: prefer one precise rule over several vague ones — agents pay for every token.

## Testing

- Build a `ProjectFacts` (or reuse a scanner fixture), run `buildRuleSet`, and assert on rule ids and texts.
- Assert that each rule has at least one evidence item.
- If the pack changes rendered output, update the renderer snapshots and review the diff.
