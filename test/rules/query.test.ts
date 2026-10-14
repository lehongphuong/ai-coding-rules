import { describe, expect, it } from 'vitest';
import { createFactQuery } from '../../src/rules/query.js';
import { cmd, fact, project } from './helpers.js';

const ws = [{ dir: 'apps/api', name: 'api' }];

describe('FactQuery', () => {
  it('filters facts by scope', () => {
    const p = project(
      [fact('language', 'go'), fact('language', 'typescript', { scope: 'apps/api' })],
      ws,
    );
    expect(createFactQuery(p).values('language')).toEqual(['go']);
    expect(createFactQuery(p, 'apps/api').values('language')).toEqual(['typescript']);
    expect(createFactQuery(p).isRoot).toBe(true);
    expect(createFactQuery(p, 'apps/api').isRoot).toBe(false);
  });

  it('inherits only packageManager, ci, monorepo and indent from root', () => {
    const p = project(
      [
        fact('packageManager', 'pnpm'),
        fact('ci', 'github-actions'),
        fact('monorepo', 'turborepo'),
        fact('indent', '2'),
        fact('language', 'typescript'),
        fact('testRunner', 'jest'),
      ],
      ws,
    );
    const q = createFactQuery(p, 'apps/api');
    expect(q.values('packageManager')).toEqual(['pnpm']);
    expect(q.has('ci', 'github-actions')).toBe(true);
    expect(q.has('monorepo')).toBe(true);
    expect(q.values('indent')).toEqual(['2']);
    expect(q.has('language')).toBe(false);
    expect(q.has('testRunner')).toBe(false);
  });

  it('prefers strong child facts over inherited ones, but not weak guesses', () => {
    const facts = [fact('packageManager', 'pnpm')];
    const strong = project([...facts, fact('packageManager', 'pub', { scope: 'apps/api' })], ws);
    expect(createFactQuery(strong, 'apps/api').values('packageManager')).toEqual(['pub']);
    const weak = project(
      [...facts, fact('packageManager', 'npm', { scope: 'apps/api', confidence: 0.5 })],
      ws,
    );
    expect(createFactQuery(weak, 'apps/api').values('packageManager')).toEqual(['pnpm']);
  });

  it('orders by confidence and compares values loosely', () => {
    const p = project([
      fact('packageManager', 'npm', { confidence: 0.5 }),
      fact('packageManager', 'yarn', { confidence: 0.95 }),
      fact('typescriptStrict', 'true'),
      fact('indent', 4),
    ]);
    const q = createFactQuery(p);
    expect(q.best('packageManager')?.value).toBe('yarn');
    expect(q.values('packageManager')).toEqual(['yarn', 'npm']);
    expect(q.has('typescriptStrict', true)).toBe(true);
    expect(q.has('indent', '4')).toBe(true);
    expect(q.has('indent', '2')).toBe(false);
  });

  it('lists commands in kind order and finds the first per kind', () => {
    const p = project([
      cmd('lint', 'pnpm lint'),
      cmd('test', 'pnpm test'),
      cmd('install', 'pnpm install'),
      cmd('test', 'pnpm test:cov', { name: 'test:cov' }),
    ]);
    const q = createFactQuery(p);
    expect(q.commands().map((c) => c.value)).toEqual([
      'pnpm install',
      'pnpm test',
      'pnpm test:cov',
      'pnpm lint',
    ]);
    expect(q.command('test')).toBe('pnpm test');
    expect(q.command('build')).toBeUndefined();
  });

  it('collects deduplicated evidence', () => {
    const e = { file: 'pnpm-lock.yaml' };
    const p = project([
      fact('packageManager', 'pnpm', { evidence: [e, e] }),
      fact('language', 'typescript'),
    ]);
    const q = createFactQuery(p);
    expect(q.evidence('packageManager')).toEqual([e]);
    expect(q.evidence('packageManager', 'npm')).toEqual([]);
  });

  it('resolves files and dependencies relative to the scope', () => {
    const p = project([], ws, {
      'apps/api/package.json': JSON.stringify({ devDependencies: { zod: '3.0.0' } }),
      'apps/api/.env.example': '',
      'pubspec.yaml': 'name: x\ndependencies:\n  flutter_riverpod: ^2.0.0\ndev_dependencies:\n  build_runner: ^2.0.0\n',
    });
    const api = createFactQuery(p, 'apps/api');
    expect(api.path('src')).toBe('apps/api/src');
    expect(api.fileEvidence('.env.example', 'missing')).toEqual([{ file: 'apps/api/.env.example' }]);
    expect(api.dependency('zod')).toEqual({
      file: 'apps/api/package.json',
      pointer: '#devDependencies.zod',
    });
    expect(api.dependency('react')).toBeUndefined();
    const root = createFactQuery(p);
    expect(root.dependency('build_runner')).toEqual({
      file: 'pubspec.yaml',
      pointer: '#dev_dependencies.build_runner',
      line: 5,
    });
    expect(root.dependency('name')).toBeUndefined();
    expect(root.scoped('apps/api').scope).toBe('apps/api');
  });
});
