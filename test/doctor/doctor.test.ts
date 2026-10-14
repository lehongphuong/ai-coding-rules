import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/core/index.js';
import { CHECKS, failed, runDoctor, summarize } from '../../src/doctor/index.js';
import type { Finding } from '../../src/types.js';
import { PNPM_VITEST, project, scripts } from './helpers.js';

const SHARED = [
  '## Conventions',
  '',
  '- Keep functions small and focused on a single responsibility.',
  '- Prefer composition over inheritance when designing modules.',
  '- Write descriptive commit messages in the imperative mood.',
  '- Never commit secrets or credentials to the repository.',
].join('\n');

/** PLAN.md §4: a pnpm + Vitest repo with drifting instruction files. */
export function messyRepo() {
  return project(
    {
      'package.json': JSON.stringify({
        name: 'demo',
        scripts: { test: 'vitest run', build: 'tsc', lint: 'eslint .' },
      }),
      'pnpm-lock.yaml': '',
      'src/index.ts': '',
      'src/app/main.ts': '',
      'CLAUDE.md': [
        '# Demo', // 1
        '', // 2
        'Run tests with `npm test`.', // 3
        'Use Jest for unit tests.', // 4
        '', // 5
        SHARED, // 6-11
        '', // 12
      ].join('\n'),
      'AGENTS.md': [
        '# Demo', // 1
        '', // 2
        'Entry point: `src/index.ts`.', // 3
        '', // 4
        SHARED.replace('small', 'short'), // 5-10
        '', // 11
        '## Testing', // 12
        '', // 13
        '- Unit tests: `pnpm test`.', // 14
        '- End-to-end tests:', // 15
        '', // 16
        '```bash', // 17
        'pnpm test:e2e', // 18
        '```', // 19
        '', // 20
        '- Old code lives in `src/legacy/`; do not extend it.', // 21
      ].join('\n'),
      '.cursorrules': 'Use pnpm.\nKeep components small.\n',
      '.cursor/rules/testing.mdc': [
        '---',
        'description: Testing conventions',
        'globs: "**/*.test.ts"',
        'alwaysApply: false',
        '---',
        '# Testing',
        '',
        'Use Vitest for all tests.',
      ].join('\n'),
    },
    { facts: PNPM_VITEST, scripts: scripts(['test', 'build', 'lint']) },
  );
}

function view(findings: Finding[]): string[] {
  return findings.map(
    (f) =>
      `${f.severity} ${f.checkId} ${f.file}${f.line !== undefined ? `:${f.line}` : ''}${
        f.endLine !== undefined ? `-${f.endLine}` : ''
      }`,
  );
}

describe('runDoctor', () => {
  it('reports the PLAN.md §4 scenario', () => {
    const findings = runDoctor(messyRepo(), defaultConfig());
    expect(view(findings)).toEqual([
      'info budget .cursor/rules/testing.mdc',
      'info legacy .cursorrules',
      'info budget AGENTS.md',
      'info budget AGENTS.md',
      'info budget AGENTS.md',
      'warning stale/command AGENTS.md:18',
      'warning stale/path AGENTS.md:21',
      'info budget CLAUDE.md',
      'error conflict/files CLAUDE.md:3',
      'error conflict/repo CLAUDE.md:3',
      'error conflict/files CLAUDE.md:4',
      'error conflict/repo CLAUDE.md:4',
      'warning duplicate CLAUDE.md:6-11',
    ]);

    const byId = (id: string, line?: number): Finding =>
      findings.find((f) => f.checkId === id && (line === undefined || f.line === line))!;
    expect(byId('conflict/repo', 3).message).toBe(
      '"Run tests with `npm test`." — repo uses pnpm (pnpm-lock.yaml); package manager mismatch',
    );
    expect(byId('conflict/repo', 4).message).toBe(
      '"Use Jest for unit tests." — repo uses vitest (package.json#devDependencies.vitest); test runner mismatch',
    );
    expect(byId('conflict/files', 3)).toMatchObject({
      message:
        'package manager: says "npm" but .cursorrules:1 says "pnpm", AGENTS.md:14 says "pnpm"',
      related: [
        { file: '.cursorrules', line: 1 },
        { file: 'AGENTS.md', line: 14 },
      ],
    });
    expect(byId('conflict/files', 4)).toMatchObject({
      message: 'test runner: says "jest" but .cursor/rules/testing.mdc:8 says "vitest"',
      related: [{ file: '.cursor/rules/testing.mdc', line: 8 }],
    });
    expect(byId('stale/command').message).toBe(
      '`pnpm test:e2e` — script `test:e2e` is not defined in package.json',
    );
    expect(byId('stale/command').hint).toBe(
      'Available: build, lint, test. Update or remove the command.',
    );
    expect(byId('stale/path').message).toBe('references `src/legacy/` — no such file or directory');
    expect(byId('duplicate').message).toMatch(
      /^CLAUDE\.md:6-11 ≈ AGENTS\.md:5-10 \(\d+% similar\)$/,
    );
    expect(byId('legacy').hint).toContain('.cursor/rules/*.mdc');
    const infos = findings.filter((f) => f.checkId === 'budget').map((f) => f.message);
    expect(infos.map((m) => m.split(' ')[0])).toEqual([
      'cursor',
      'codex',
      'copilot',
      'windsurf',
      'claude',
    ]);
    expect(infos[0]).toMatch(/^cursor ≈ \d+ tokens \(AGENTS\.md \d+, .*\)$/);

    expect(summarize(findings)).toEqual({ errors: 4, warnings: 3, infos: 6 });
    expect(failed(findings, 'error')).toBe(true);
  });

  it('honours doctor.disable', () => {
    const config = defaultConfig();
    config.doctor.disable = ['budget', 'legacy', 'conflict/files', 'duplicate'];
    expect(view(runDoctor(messyRepo(), config))).toEqual([
      'warning stale/command AGENTS.md:18',
      'warning stale/path AGENTS.md:21',
      'error conflict/repo CLAUDE.md:3',
      'error conflict/repo CLAUDE.md:4',
    ]);
  });

  it('is quiet on a healthy repo', () => {
    const facts = project(
      {
        'package.json': '{}',
        'src/index.ts': '',
        'AGENTS.md': [
          '# Demo',
          '',
          '## Commands',
          '- Install: `pnpm install`',
          '- Test: `pnpm test` (Vitest). Never use npm or yarn.',
          '- Build: `pnpm run build`',
          '',
          'Entry point is `src/index.ts`.',
        ].join('\n'),
        'CLAUDE.md': `@AGENTS.md\n\nUse Vitest for tests; don't add Jest.\n`,
      },
      { facts: PNPM_VITEST, scripts: scripts(['test', 'build']) },
    );
    const findings = runDoctor(facts, defaultConfig());
    expect(findings.every((f) => f.severity === 'info')).toBe(true);
    expect(failed(findings, 'warning')).toBe(false);
  });

  it('exposes every check id once', () => {
    expect(CHECKS.map((c) => c.id)).toEqual([
      'conflict/repo',
      'conflict/files',
      'stale/command',
      'stale/path',
      'duplicate',
      'budget',
      'legacy',
      'empty',
    ]);
  });

  it('fails per failOn', () => {
    const warning: Finding = { checkId: 'empty', severity: 'warning', file: 'a', message: '' };
    const info: Finding = { checkId: 'legacy', severity: 'info', file: 'a', message: '' };
    expect(failed([warning, info], 'error')).toBe(false);
    expect(failed([warning, info], 'warning')).toBe(true);
    expect(failed([info], 'warning')).toBe(false);
  });
});
