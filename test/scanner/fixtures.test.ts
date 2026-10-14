import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { FactKey, ProjectFacts } from '../../src/types.js';
import { scan } from '../../src/scanner/index.js';

const FIXTURES = [
  'nestjs-pnpm',
  'react-vite',
  'nextjs-yarn',
  'flutter-app',
  'laravel-app',
  'python-fastapi',
  'go-service',
  'monorepo',
  'messy-rules',
] as const;

const cache = new Map<string, ProjectFacts>();
function fixture(name: (typeof FIXTURES)[number]): ProjectFacts {
  if (!cache.has(name)) {
    cache.set(name, scan(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))));
  }
  return cache.get(name)!;
}

/** Values of `key` in `scope`, sorted. */
function vals(p: ProjectFacts, key: FactKey, scope = ''): unknown[] {
  return p.facts
    .filter((f) => f.key === key && f.scope === scope)
    .map((f) => f.value)
    .sort();
}

/** `kind → command` for one scope (first command per kind). */
function cmds(p: ProjectFacts, scope = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of p.facts) {
    if (f.key === 'command' && f.scope === scope && f.meta?.kind && !(f.meta.kind in out)) {
      out[f.meta.kind] = String(f.value);
    }
  }
  return out;
}

describe.each(FIXTURES)('fixture %s invariants', (name) => {
  it('has evidence on every fact and scopes that match a workspace', () => {
    const p = fixture(name);
    const dirs = new Set(p.workspaces.map((w) => w.dir));
    expect(p.workspaces[0]!.dir).toBe('');
    expect(p.facts.length).toBeGreaterThan(0);
    for (const f of p.facts) {
      expect(f.evidence.length, `${f.key}=${String(f.value)}`).toBeGreaterThan(0);
      expect(dirs.has(f.scope), `${f.key} scope ${f.scope}`).toBe(true);
      for (const e of f.evidence) {
        expect(p.files.has(e.file) || p.files.hasDir(e.file), `evidence ${e.file}`).toBe(true);
      }
      expect(f.confidence).toBeGreaterThan(0);
      expect(f.confidence).toBeLessThanOrEqual(1);
    }
    for (const s of p.scripts) expect(dirs.has(s.scope)).toBe(true);
  });
});

describe('fixtures', () => {
  it('nestjs-pnpm', () => {
    const p = fixture('nestjs-pnpm');
    expect(p.name).toBe('nestjs-pnpm');
    expect(p.description).toBe('Orders API built with NestJS');
    expect(vals(p, 'framework')).toEqual(['nestjs']);
    expect(vals(p, 'language')).toEqual(['typescript']);
    expect(vals(p, 'typescriptStrict')).toEqual([true]);
    expect(vals(p, 'packageManager')).toEqual(['pnpm']);
    expect(vals(p, 'testRunner')).toEqual(['jest']);
    expect(vals(p, 'linter')).toEqual(['eslint']);
    expect(vals(p, 'formatter')).toEqual(['prettier']);
    expect(vals(p, 'orm')).toEqual(['prisma']);
    expect(cmds(p)).toMatchObject({
      install: 'pnpm install',
      test: 'pnpm test',
      e2e: 'pnpm test:e2e',
      lint: 'pnpm lint',
      build: 'pnpm build',
      migrate: 'pnpm db:migrate',
    });
    expect(p.scripts.map((s) => s.name)).toContain('start:dev');
  });

  it('react-vite', () => {
    const p = fixture('react-vite');
    expect(vals(p, 'framework')).toEqual(['react']);
    expect(vals(p, 'packageManager')).toEqual(['npm']);
    expect(vals(p, 'testRunner')).toEqual(['vitest']);
    expect(vals(p, 'styling')).toEqual(['tailwind']);
    expect(vals(p, 'stateManagement')).toEqual(['zustand']);
    expect(cmds(p)).toMatchObject({
      install: 'npm install',
      test: 'npm test',
      lint: 'npm run lint',
      dev: 'npm run dev',
      typecheck: 'npm run typecheck',
    });
  });

  it('nextjs-yarn', () => {
    const p = fixture('nextjs-yarn');
    expect(vals(p, 'framework')).toEqual(['nextjs', 'react']);
    expect(vals(p, 'packageManager')).toEqual(['yarn']);
    expect(vals(p, 'testRunner')).toEqual(['playwright']);
    expect(vals(p, 'typescriptStrict')).toEqual([false]);
    expect(cmds(p)).toMatchObject({ e2e: 'yarn e2e', build: 'yarn build', dev: 'yarn dev' });
  });

  it('flutter-app', () => {
    const p = fixture('flutter-app');
    expect(p.name).toBe('flutter_app');
    expect(vals(p, 'framework')).toEqual(['flutter']);
    expect(vals(p, 'language')).toEqual(['dart']);
    expect(vals(p, 'packageManager')).toEqual(['pub']);
    expect(vals(p, 'testRunner')).toEqual(['flutter-test']);
    expect(vals(p, 'linter')).toEqual(['flutter-lints']);
    expect(vals(p, 'stateManagement')).toEqual(['riverpod']);
    expect(cmds(p)).toMatchObject({
      install: 'flutter pub get',
      test: 'flutter test',
      lint: 'flutter analyze',
      format: 'dart format .',
      codegen: 'dart run build_runner build --delete-conflicting-outputs',
    });
  });

  it('laravel-app', () => {
    const p = fixture('laravel-app');
    expect(p.name).toBe('acme/laravel-app');
    expect(vals(p, 'framework')).toEqual(['laravel']);
    expect(vals(p, 'testRunner')).toEqual(['pest', 'phpunit']);
    expect(vals(p, 'linter')).toEqual(['larastan']);
    expect(vals(p, 'formatter')).toEqual(['pint']);
    expect(vals(p, 'orm')).toEqual(['eloquent']);
    expect(cmds(p)).toMatchObject({
      install: 'composer install',
      test: 'php artisan test',
      format: './vendor/bin/pint',
      migrate: 'php artisan migrate',
    });
    expect(p.scripts.filter((s) => s.source === 'composer').map((s) => s.name)).toEqual([
      'post-autoload-dump',
      'test',
      'lint',
    ]);
  });

  it('python-fastapi', () => {
    const p = fixture('python-fastapi');
    expect(vals(p, 'framework')).toEqual(['fastapi']);
    expect(vals(p, 'packageManager')).toEqual(['uv']);
    expect(vals(p, 'testRunner')).toEqual(['pytest']);
    expect(vals(p, 'linter')).toEqual(['ruff']);
    expect(vals(p, 'formatter')).toEqual(['ruff-format']);
    expect(vals(p, 'orm')).toEqual(['sqlalchemy']);
    expect(cmds(p)).toMatchObject({
      install: 'uv sync',
      test: 'uv run pytest',
      lint: 'uv run ruff check .',
    });
  });

  it('go-service', () => {
    const p = fixture('go-service');
    expect(p.name).toBe('go-service');
    expect(vals(p, 'language')).toEqual(['go']);
    expect(vals(p, 'testRunner')).toEqual(['go-test']);
    expect(vals(p, 'linter')).toEqual(['golangci-lint']);
    expect(vals(p, 'orm')).toEqual(['gorm']);
    expect(cmds(p)).toMatchObject({ test: 'go test ./...', build: 'go build ./...' });
    expect(p.facts.some((f) => f.value === 'make test' && f.meta?.kind === 'test')).toBe(true);
    expect(p.scripts.map((s) => `${s.source}:${s.name}`)).toEqual([
      'make:test',
      'make:lint',
      'make:run',
    ]);
  });

  it('monorepo', () => {
    const p = fixture('monorepo');
    expect(p.name).toBe('acme-monorepo');
    expect(p.workspaces.map((w) => [w.dir, w.name])).toEqual([
      ['', 'acme-monorepo'],
      ['apps/api', '@acme/api'],
      ['apps/mobile', 'acme_mobile'],
      ['apps/web', '@acme/web'],
      ['packages/ui', '@acme/ui'],
    ]);
    expect(vals(p, 'monorepo')).toEqual(['pnpm-workspaces', 'turborepo']);
    expect(vals(p, 'packageManager')).toEqual(['pnpm']);
    expect(vals(p, 'ci')).toEqual(['github-actions']);
    expect(vals(p, 'indent')).toEqual(['2']);
    expect(vals(p, 'language')).toEqual([]);
    expect(vals(p, 'framework', 'apps/web')).toEqual(['nextjs', 'react']);
    expect(vals(p, 'framework', 'apps/api')).toEqual(['nestjs']);
    expect(vals(p, 'framework', 'apps/mobile')).toEqual(['flutter']);
    expect(vals(p, 'orm', 'apps/api')).toEqual(['typeorm']);
    expect(vals(p, 'linter', 'apps/mobile')).toEqual(['very-good-analysis']);
    // workspace packages inherit the root lockfile: no own packageManager / install
    expect(vals(p, 'packageManager', 'apps/web')).toEqual([]);
    expect(cmds(p, 'apps/web')).toEqual({
      dev: 'pnpm dev',
      build: 'pnpm build',
      lint: 'pnpm lint',
      test: 'pnpm test',
    });
    expect(cmds(p, 'apps/api')).toMatchObject({ test: 'pnpm test', e2e: 'pnpm test:e2e' });
    expect(cmds(p)).toMatchObject({ install: 'pnpm install', test: 'pnpm test' });
    expect(p.scripts.filter((s) => s.scope === 'apps/api').map((s) => s.name)).toContain(
      'start:dev',
    );
  });

  it('messy-rules', () => {
    const p = fixture('messy-rules');
    expect(vals(p, 'packageManager')).toEqual(['pnpm']);
    expect(vals(p, 'testRunner')).toEqual(['vitest']);
    expect(vals(p, 'agentFile')).toEqual([
      '.cursor/rules/testing.mdc',
      '.cursorrules',
      'AGENTS.md',
      'CLAUDE.md',
    ]);
    expect(p.scripts.map((s) => s.name)).toEqual(['test', 'lint']);
    expect(p.files.read('CLAUDE.md')).toContain('npm test');
    expect(p.files.read('AGENTS.md')).toContain('pnpm test:e2e');
  });
});
