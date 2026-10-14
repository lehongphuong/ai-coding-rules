import type { Rule, RuleSet, SectionId } from '../../src/types.js';

export function rule(
  id: string,
  section: SectionId,
  text: string,
  scope = '',
  extra: Partial<Rule> = {},
): Rule {
  return {
    id,
    section,
    text,
    scope,
    pack: id.split('/')[0]!,
    evidence: [{ file: scope ? `${scope}/package.json` : 'package.json' }],
    priority: 50,
    ...extra,
  };
}

/** Root + two scopes (apps/api, apps/mobile), one inferred rule, multi-evidence rules. */
export function sampleRuleSet(): RuleSet {
  return {
    project: { name: 'acme', description: 'Monorepo for the Acme apps.' },
    scopes: [
      { dir: '', name: 'acme', summary: 'pnpm workspaces · TypeScript' },
      { dir: 'apps/api', name: '@acme/api', summary: 'NestJS · TypeScript' },
      { dir: 'apps/mobile', name: 'mobile', summary: 'Flutter · Dart' },
    ],
    rules: [
      rule(
        'common/overview',
        'overview',
        'pnpm monorepo with a NestJS API and a Flutter app.',
        '',
        {
          priority: 10,
          evidence: [
            { file: 'pnpm-workspace.yaml' },
            { file: 'package.json', pointer: '#workspaces' },
          ],
        },
      ),
      rule(
        'common/pm',
        'commands',
        'Use `pnpm` for all package commands; never use npm or yarn.',
        '',
        {
          priority: 10,
          evidence: [{ file: 'pnpm-lock.yaml' }],
        },
      ),
      rule('common/cmd-test', 'commands', 'Test: `pnpm test`', '', {
        evidence: [{ file: 'package.json', pointer: '#scripts.test' }],
      }),
      rule(
        'typescript/strict',
        'code-style',
        'Keep TypeScript `strict` mode on; do not use `any`.',
        '',
        {
          evidence: [
            { file: 'tsconfig.json', pointer: '#compilerOptions.strict' },
            { file: 'tsconfig.json', pointer: '#compilerOptions.strict' },
            { file: 'a.json' },
            { file: 'b.json' },
            { file: 'c.json' },
          ],
        },
      ),
      rule('ai/naming', 'architecture', 'Group features by domain folder.', '', {
        pack: 'ai',
        inferred: true,
        evidence: [{ file: '(ai)', note: 'llama3.1' }],
      }),
      rule('common/no-secrets', 'security', 'Never commit `.env` files or secrets.', '', {
        evidence: [{ file: '.gitignore' }],
      }),
      rule(
        'nestjs/modules',
        'architecture',
        'Organise code in NestJS modules under `src/`.',
        'apps/api',
        {
          evidence: [{ file: 'apps/api/package.json', pointer: '#dependencies.@nestjs/core' }],
        },
      ),
      rule('nestjs/cmd-test', 'commands', 'Test: `pnpm --filter @acme/api test`', 'apps/api', {
        priority: 20,
      }),
      rule('flutter/state', 'architecture', 'Use Riverpod providers for state.', 'apps/mobile', {
        evidence: [{ file: 'apps/mobile/pubspec.yaml', pointer: 'dependencies.flutter_riverpod' }],
      }),
      rule(
        'flutter/tests',
        'testing',
        'Put widget tests in `test/` next to the feature name.',
        'apps/mobile',
      ),
    ],
  };
}
