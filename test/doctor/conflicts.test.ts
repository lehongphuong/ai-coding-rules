import { describe, expect, it } from 'vitest';
import { checkConflictFiles } from '../../src/doctor/checks/conflict-files.js';
import { checkConflictRepo } from '../../src/doctor/checks/conflict-repo.js';
import { docScope } from '../../src/doctor/context.js';
import { parseInstructionDoc } from '../../src/doctor/parser.js';
import { brief, context, fact, PNPM_VITEST, project } from './helpers.js';

describe('conflict/repo', () => {
  it('reports claims that contradict repo facts', () => {
    const facts = project(
      {
        'CLAUDE.md': '# Dev\n\nRun tests with `npm test`.\nUse Jest for unit tests.\nIndent with 4 spaces.\n',
      },
      { facts: [...PNPM_VITEST, fact('indent', '2', { file: '.editorconfig' })] },
    );
    const findings = checkConflictRepo(context(facts));
    expect(brief(findings)).toEqual([
      'CLAUDE.md:3 conflict/repo',
      'CLAUDE.md:4 conflict/repo',
      'CLAUDE.md:5 conflict/repo',
    ]);
    expect(findings[0]).toMatchObject({
      severity: 'error',
      message:
        '"Run tests with `npm test`." — repo uses pnpm (pnpm-lock.yaml); package manager mismatch',
    });
    expect(findings[0]!.hint).toContain('pnpm');
    expect(findings[1]!.message).toContain('repo uses vitest (package.json#devDependencies.vitest)');
  });

  it('reports one finding per line and key', () => {
    const facts = project({ 'AGENTS.md': 'Run `npm install && npm test` and `npm run lint`.\n' }, {
      facts: PNPM_VITEST,
    });
    expect(brief(checkConflictRepo(context(facts)))).toEqual(['AGENTS.md:1 conflict/repo']);
  });

  it('does not report negated claims, matching facts or weak facts', () => {
    const files = {
      'AGENTS.md': [
        "Don't use npm or yarn; use pnpm.",
        'Use Vitest, not Jest, for tests.',
        'Never run `npm install`.',
        'Run tests with `pnpm test`.',
      ].join('\n'),
    };
    expect(checkConflictRepo(context(project(files, { facts: PNPM_VITEST })))).toEqual([]);
    // Scanner only guessed npm (no lockfile): no conflict.
    const weak = [fact('packageManager', 'npm', { confidence: 0.5 })];
    const yarn = { 'CLAUDE.md': 'Run `yarn test` for tests.\n' };
    expect(checkConflictRepo(context(project(yarn, { facts: weak })))).toEqual([]);
  });

  it('ignores claims from other ecosystems and accepts values from child scopes at root', () => {
    const facts = project(
      {
        'AGENTS.md': 'Run `flutter test` in apps/mobile.\nThe API uses Jest for tests.\n',
        'apps/web/AGENTS.md': 'Use Jest for tests.\n',
      },
      {
        facts: [
          ...PNPM_VITEST,
          fact('testRunner', 'jest', { scope: 'apps/api' }),
          fact('testRunner', 'vitest', { scope: 'apps/web' }),
        ],
        workspaces: [
          { dir: 'apps/api', name: 'api' },
          { dir: 'apps/web', name: 'web' },
        ],
      },
    );
    // Root doc: jest exists in apps/api → ok. apps/web doc: jest contradicts vitest there.
    expect(brief(checkConflictRepo(context(facts)))).toEqual(['apps/web/AGENTS.md:1 conflict/repo']);
  });

  it('inherits packageManager from root for child scopes', () => {
    const facts = project(
      { 'apps/api/AGENTS.md': 'Install with `npm install`.\n' },
      { facts: PNPM_VITEST, workspaces: [{ dir: 'apps/api', name: 'api' }] },
    );
    expect(brief(checkConflictRepo(context(facts)))).toEqual(['apps/api/AGENTS.md:1 conflict/repo']);
  });

  it('accepts a formatter the repo uses as a linter', () => {
    const facts = project(
      { 'AGENTS.md': 'Format code with Biome.\n' },
      { facts: [fact('formatter', 'prettier'), fact('linter', 'biome')] },
    );
    expect(checkConflictRepo(context(facts))).toEqual([]);
  });
});

describe('docScope', () => {
  const ws = [
    { dir: '', name: 'root' },
    { dir: 'apps/api', name: 'api' },
  ];
  it('uses globs/applyTo front matter', () => {
    const mdc = parseInstructionDoc('.cursor/rules/api.mdc', '---\nglobs: apps/api/**/*.ts\n---\nx');
    const copilot = parseInstructionDoc(
      '.github/instructions/api.instructions.md',
      '---\napplyTo: "apps/api/**"\n---\nx',
    );
    const any = parseInstructionDoc('.cursor/rules/ts.mdc', '---\nglobs: ["**/*.ts"]\n---\nx');
    expect(docScope(mdc, ws)).toBe('apps/api');
    expect(docScope(copilot, ws)).toBe('apps/api');
    expect(docScope(any, ws)).toBe('');
    expect(docScope(parseInstructionDoc('apps/api/AGENTS.md', 'x'), ws)).toBe('apps/api');
  });
});

describe('conflict/files', () => {
  it('reports contradicting files in the same scope, on the one the repo contradicts', () => {
    const facts = project(
      {
        'AGENTS.md': '# Testing\n\nUse Vitest for tests.\n',
        'CLAUDE.md': '# Testing\n\nUse Jest for tests.\n',
        '.cursor/rules/testing.mdc': '---\ndescription: tests\n---\nUse Vitest for all tests.\n',
      },
      { facts: PNPM_VITEST },
    );
    const findings = checkConflictFiles(context(facts));
    expect(brief(findings)).toEqual(['CLAUDE.md:3 conflict/files']);
    expect(findings[0]!.related).toEqual([
      { file: '.cursor/rules/testing.mdc', line: 4 },
      { file: 'AGENTS.md', line: 3 },
    ]);
    expect(findings[0]!.message).toBe(
      'test runner: says "jest" but .cursor/rules/testing.mdc:4 says "vitest", AGENTS.md:3 says "vitest"',
    );
  });

  it('reports on the later file when the repo has no opinion', () => {
    const facts = project({
      'AGENTS.md': 'Use single quotes for strings.\n',
      'GEMINI.md': 'Use double quotes for strings.\n',
    });
    const findings = checkConflictFiles(context(facts));
    expect(brief(findings)).toEqual(['GEMINI.md:1 conflict/files']);
    expect(findings[0]!.related).toEqual([{ file: 'AGENTS.md', line: 1 }]);
  });

  it('ignores different scopes, negations, compatible values and other families', () => {
    const facts = project(
      {
        'AGENTS.md': 'Use Vitest for unit tests and Playwright for e2e tests.\nNo semicolons.\n',
        'CLAUDE.md': 'Use Playwright for e2e tests. Never use Jest.\nNo semicolons.\n',
        'apps/api/AGENTS.md': 'Use Jest for tests.\n',
        '.cursor/rules/php.mdc': 'Write tests with PHPUnit.\n',
        '.github/copilot-instructions.md': 'Write tests with Pest.\n',
      },
      { workspaces: [{ dir: 'apps/api', name: 'api' }] },
    );
    expect(checkConflictFiles(context(facts))).toEqual([]);
  });
});
