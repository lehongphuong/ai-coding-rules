import { describe, expect, it } from 'vitest';
import { buildRuleSet } from '../../src/rules/index.js';
import type { Rule, RuleSet } from '../../src/types.js';
import { config } from './helpers.js';
import { SCENARIOS } from './scenarios.js';

const build = (name: string): RuleSet => buildRuleSet(SCENARIOS[name]!(), config());
const text = (rs: RuleSet, id: string, scope = ''): string | undefined =>
  rs.rules.find((r) => r.id === id && r.scope === scope)?.text;
const idsIn = (rs: RuleSet, scope = ''): string[] =>
  rs.rules.filter((r) => r.scope === scope).map((r) => r.id);

describe('scenario: NestJS + pnpm + jest + prisma', () => {
  const rs = build('nestjs');

  it('summarises the stack', () => {
    expect(text(rs, 'common/overview')).toBe(
      'NestJS API written in TypeScript (strict), managed with pnpm.',
    );
    expect(rs.scopes[0]!.summary).toBe('NestJS · TypeScript · pnpm');
  });

  it('lists commands in kind order', () => {
    const cmds = rs.rules.filter((r) => r.section === 'commands').map((r) => r.text);
    expect(cmds).toEqual([
      'Use `pnpm` for all dependency commands; do not use npm, yarn or bun.',
      'Install: `pnpm install`',
      'Dev: `pnpm start:dev`',
      'Build: `pnpm build`',
      'Test: `pnpm test`',
      'E2E: `pnpm test:e2e`',
      'Lint: `pnpm lint`',
      'Format: `pnpm format`',
    ]);
  });

  it('adds nestjs, typescript and prisma rules backed by evidence', () => {
    expect(idsIn(rs)).toEqual(
      expect.arrayContaining([
        'nestjs/modules',
        'nestjs/dto-validation',
        'nestjs/config',
        'typescript/no-any',
        'common/prisma',
        'common/no-secrets',
        'common/ci',
      ]),
    );
    expect(text(rs, 'common/prisma')).toContain('`pnpm prisma generate`');
    expect(text(rs, 'common/formatter')).toBe(
      'Format with Prettier (`pnpm format`) before committing.',
    );
    expect(text(rs, 'common/test-before-finish')).toBe(
      'Run `pnpm test` and make sure it passes before finishing a task.',
    );
    // Express is NestJS' platform, not a separate stack.
    expect(rs.rules.some((r) => r.pack === 'express')).toBe(false);
  });
});

describe('scenario: React + Vite + Vitest + npm', () => {
  const rs = build('react');

  it('emits react, vite and tailwind rules', () => {
    expect(text(rs, 'common/overview')).toBe(
      'React app written in TypeScript (strict), managed with npm.',
    );
    expect(text(rs, 'common/package-manager')).toBe(
      'Use `npm` for all dependency commands; do not use pnpm, yarn or bun.',
    );
    expect(idsIn(rs)).toEqual(
      expect.arrayContaining([
        'react/function-components',
        'react/testing-library',
        'common/vite-env',
        'common/styling',
      ]),
    );
    expect(text(rs, 'common/test-runner')).toContain('Vitest');
    expect(text(rs, 'typescript/ts-only')).toContain('`.tsx`');
  });

  it('omits rules without evidence', () => {
    expect(idsIn(rs)).not.toContain('common/formatter');
    expect(idsIn(rs)).not.toContain('common/ci');
    expect(idsIn(rs)).not.toContain('common/prisma');
    expect(idsIn(rs)).not.toContain('nextjs/env');
  });
});

describe('scenario: Flutter + riverpod + build_runner', () => {
  const rs = build('flutter');

  it('emits riverpod and codegen rules', () => {
    expect(text(rs, 'common/overview')).toBe('Flutter app written in Dart, managed with pub.');
    expect(text(rs, 'flutter/state')).toContain('Riverpod');
    expect(idsIn(rs)).toContain('flutter/riverpod-generator');
    expect(text(rs, 'flutter/codegen')).toBe(
      'Run `dart run build_runner build --delete-conflicting-outputs` after changing annotated files.',
    );
    expect(text(rs, 'flutter/generated-files')).toContain('`*.freezed.dart`');
    expect(text(rs, 'common/command-lint')).toBe('Lint: `flutter analyze`');
  });

  it('has no node package-manager rule', () => {
    expect(idsIn(rs)).not.toContain('common/package-manager');
  });
});

describe('scenario: Laravel + Pest + Pint', () => {
  const rs = build('laravel');

  it('emits laravel rules', () => {
    expect(idsIn(rs)).toEqual(
      expect.arrayContaining([
        'laravel/artisan',
        'laravel/eloquent',
        'laravel/form-requests',
        'laravel/migrations',
        'laravel/tests',
        'php/static-analysis',
      ]),
    );
    expect(text(rs, 'common/formatter')).toBe('Format with `./vendor/bin/pint` before committing.');
    expect(text(rs, 'laravel/tests')).toContain('Pest');
    expect(text(rs, 'common/command-migrate')).toBe('Migrate: `php artisan migrate`');
  });
});

describe('scenario: FastAPI + pytest + ruff + uv', () => {
  const rs = build('fastapi');

  it('emits python and fastapi rules', () => {
    expect(text(rs, 'common/overview')).toBe('FastAPI service written in Python, managed with uv.');
    expect(text(rs, 'common/package-manager')).toBe(
      'Use `uv` for all dependency commands; do not use pip, poetry or pipenv.',
    );
    expect(idsIn(rs)).toEqual(
      expect.arrayContaining([
        'fastapi/pydantic',
        'fastapi/depends',
        'python/pytest',
        'python/env-tool',
        'python/alembic',
      ]),
    );
    expect(text(rs, 'common/linter')).toContain('`uv run ruff check .`');
  });
});

describe('scenario: Go', () => {
  const rs = build('go');

  it('emits go rules without mismatched commands', () => {
    expect(text(rs, 'common/overview')).toBe('Go project, managed with Go modules.');
    expect(idsIn(rs)).toEqual(
      expect.arrayContaining(['go/errors', 'go/layout', 'go/modules', 'go/table-tests']),
    );
    // `go vet` is not golangci-lint, so it must not be presented as such.
    expect(text(rs, 'common/linter')).not.toContain('go vet');
    expect(text(rs, 'common/command-lint')).toBe('Lint: `go vet ./...`');
  });
});

describe('scenario: monorepo (pnpm root + NestJS api + Flutter mobile)', () => {
  const rs = build('monorepo');

  it('lists scopes root first', () => {
    expect(rs.scopes).toEqual([
      { dir: '', name: 'mono', summary: 'pnpm workspaces' },
      { dir: 'apps/api', name: 'api', summary: 'NestJS · TypeScript · pnpm' },
      { dir: 'apps/mobile', name: 'mobile', summary: 'Flutter · Dart · pub' },
    ]);
  });

  it('describes the layout at the root', () => {
    expect(text(rs, 'monorepo/layout')).toBe(
      'Monorepo (pnpm workspaces) with workspaces `apps/api` (NestJS) and `apps/mobile` (Flutter).',
    );
    expect(idsIn(rs)).toContain('monorepo/pnpm-workspaces');
    expect(idsIn(rs, 'apps/api')).not.toContain('monorepo/layout');
  });

  it('does not duplicate the package manager, CI or indent rules into children', () => {
    const pm = rs.rules.filter((r) => r.id === 'common/package-manager');
    expect(pm.map((r) => r.scope)).toEqual(['']);
    for (const id of ['common/ci', 'common/indent']) {
      expect(rs.rules.filter((r) => r.id === id).map((r) => r.scope)).toEqual(['']);
    }
  });

  it('gives each workspace its own stack rules', () => {
    expect(text(rs, 'common/overview', 'apps/api')).toBe(
      'NestJS API written in TypeScript (strict), managed with pnpm.',
    );
    expect(idsIn(rs, 'apps/api')).toContain('nestjs/modules');
    expect(idsIn(rs, 'apps/mobile')).toContain('flutter/codegen');
    expect(idsIn(rs, 'apps/mobile')).not.toContain('nestjs/modules');
    expect(text(rs, 'common/prisma', 'apps/api')).toContain('`prisma/schema.prisma`');
  });
});

describe('invariants', () => {
  for (const name of Object.keys(SCENARIOS)) {
    it(`holds for ${name}`, () => {
      const rs = build(name);
      expect(rs.rules.length).toBeGreaterThan(5);
      const keys = new Set<string>();
      for (const r of rs.rules as Rule[]) {
        expect(r.evidence.length, r.id).toBeGreaterThan(0);
        for (const e of r.evidence) expect(e.file, r.id).toMatch(/\S/);
        expect(r.text.length, r.id).toBeLessThanOrEqual(200);
        expect(r.text, r.id).not.toMatch(/undefined|\[object|NaN/);
        expect(r.text, r.id).not.toMatch(/\n/);
        const key = `${r.scope}\u0000${r.id}`;
        expect(keys.has(key), r.id).toBe(false);
        keys.add(key);
        expect(r.id.startsWith(`${r.pack}/`), r.id).toBe(true);
      }
      expect(rs.scopes[0]!.dir).toBe('');
      expect(buildRuleSet(SCENARIOS[name]!(), config())).toEqual(rs);
    });
  }
});

describe('snapshots', () => {
  const render = (rs: RuleSet): string[] =>
    rs.rules.map((r) => `[${r.scope || '.'}] ${r.section} ${r.id}: ${r.text}`);

  it('nestjs', () => {
    expect(render(build('nestjs'))).toMatchSnapshot();
  });

  it('monorepo', () => {
    expect(render(build('monorepo'))).toMatchSnapshot();
  });
});
