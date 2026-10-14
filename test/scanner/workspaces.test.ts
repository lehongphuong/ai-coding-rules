import { describe, expect, it } from 'vitest';
import { createMemoryFileIndex } from '../../src/core/index.js';
import { expandPatterns, detectWorkspaces, goWorkUses } from '../../src/scanner/workspaces.js';
import { detectScripts, justRecipes, makeTargets } from '../../src/scanner/scripts.js';
import { json } from './helpers.js';

const ws = (contents: Record<string, string>) =>
  detectWorkspaces(createMemoryFileIndex(contents, '/repos/my-repo'));

describe('detectWorkspaces', () => {
  it('returns only the root for a single package', () => {
    const r = ws({ 'package.json': json({ name: 'solo' }), 'src/a.ts': '' });
    expect(r.workspaces).toEqual([{ dir: '', name: 'solo', manifest: 'package.json' }]);
    expect(r.facts).toEqual([]);
  });

  it('expands pnpm-workspace globs with negations', () => {
    const r = ws({
      'package.json': '{}',
      'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'packages/**'\n  - '!apps/old'\n",
      'turbo.json': '{}',
      'apps/web/package.json': json({ name: '@x/web' }),
      'apps/old/package.json': '{}',
      'apps/docs/README.md': '',
      'packages/ui/package.json': '{}',
      'packages/tools/eslint/package.json': '{}',
      'tools/gen/package.json': '{}',
    });
    expect(r.workspaces.map((w) => w.dir)).toEqual([
      '',
      'apps/web',
      'packages/tools/eslint',
      'packages/ui',
    ]);
    expect(r.workspaces[0]!.name).toBe('my-repo');
    expect(r.workspaces[1]!.name).toBe('@x/web');
    expect(r.workspaces[2]!.name).toBe('eslint');
    expect(r.facts.map((f) => f.value)).toEqual(['pnpm-workspaces', 'turborepo']);
    expect(r.facts.every((f) => f.scope === '' && f.evidence.length > 0)).toBe(true);
  });

  it('reads package.json workspaces (array and object) and picks yarn/npm', () => {
    const arr = ws({
      'package.json': json({ workspaces: ['packages/*'] }),
      'yarn.lock': '',
      'packages/a/package.json': '{}',
    });
    expect(arr.facts.map((f) => f.value)).toEqual(['yarn-workspaces']);
    expect(arr.workspaces.map((w) => w.dir)).toEqual(['', 'packages/a']);
    const obj = ws({
      'package.json': json({ workspaces: { packages: ['libs/*'] } }),
      'libs/b/composer.json': json({ name: 'acme/b' }),
    });
    expect(obj.facts.map((f) => f.value)).toEqual(['npm-workspaces']);
    expect(obj.workspaces[1]).toEqual({
      dir: 'libs/b',
      name: 'acme/b',
      manifest: 'libs/b/composer.json',
    });
  });

  it('supports lerna, melos, nx and go.work', () => {
    expect(
      ws({ 'lerna.json': '{}', 'packages/a/package.json': '{}' }).workspaces.map((w) => w.dir),
    ).toEqual(['', 'packages/a']);
    const melos = ws({
      'melos.yaml': 'name: m\npackages:\n  - packages/**\n',
      'packages/core/pubspec.yaml': 'name: core\n',
    });
    expect(melos.workspaces[1]).toEqual({
      dir: 'packages/core',
      name: 'core',
      manifest: 'packages/core/pubspec.yaml',
    });
    const go = ws({
      'go.work': 'go 1.22\n\nuse (\n\t./svc/a\n\t./svc/b // b\n)\n',
      'svc/a/go.mod': '',
      'svc/b/go.mod': '',
    });
    expect(go.facts.map((f) => f.value)).toEqual(['go-work']);
    expect(go.workspaces.map((w) => w.dir)).toEqual(['', 'svc/a', 'svc/b']);
    expect(goWorkUses('use ./one\n')).toEqual(['./one']);
    const nx = ws({ 'nx.json': '{}', 'apps/x/package.json': '{}' });
    expect(nx.workspaces.map((w) => w.dir)).toEqual(['', 'apps/x']);
  });

  it('falls back to manifests up to 2 levels deep without a monorepo tool', () => {
    const r = ws({
      'mobile/pubspec.yaml': 'name: mobile_app\n',
      'backend/api/package.json': json({ name: 'api' }),
      'a/b/c/package.json': '{}',
      'svc/pyproject.toml': '[project]\nname = "svc"\n',
    });
    expect(r.workspaces.map((w) => `${w.dir}:${w.name}`)).toEqual([
      ':my-repo',
      'backend/api:api',
      'mobile:mobile_app',
      'svc:svc',
    ]);
  });

  it('expandPatterns handles ** and !', () => {
    expect(expandPatterns(['apps/*', '!apps/b'], ['apps/a', 'apps/b', 'apps/a/x'])).toEqual([
      'apps/a',
    ]);
    expect(expandPatterns(['packages/**'], ['packages/a', 'packages/a/b'])).toEqual([
      'packages/a',
      'packages/a/b',
    ]);
  });
});

describe('scripts', () => {
  it('parses Makefile targets', () => {
    const text =
      '.PHONY: a\nVAR := 1\nX = y\nbuild test: deps\n\t@echo hi\n%.o: %.c\n\ninstall:\n# c: d\n';
    expect(makeTargets(text)).toEqual([
      { name: 'build', line: 4 },
      { name: 'test', line: 4 },
      { name: 'install', line: 8 },
    ]);
  });

  it('parses justfile recipes', () => {
    const text =
      'set dotenv-load := true\nalias t := test\nversion := "1"\n\ntest *args:\n  cargo test\n@lint:\n  echo\n';
    expect(justRecipes(text).map((r) => r.name)).toEqual(['test', 'lint']);
  });

  it('collects scripts per workspace from every source', () => {
    const files = createMemoryFileIndex({
      'package.json': '{\n  "scripts": {\n    "test": "vitest"\n  }\n}',
      'composer.json': json({ scripts: { lint: 'phpstan' } }),
      Makefile: 'deploy:\n\t./deploy.sh\n',
      justfile: 'fmt:\n  prettier -w .\n',
      'melos.yaml': 'name: m\nscripts:\n  analyze: melos exec -- flutter analyze\n',
      'apps/web/package.json': json({ scripts: { dev: 'next dev' } }),
    });
    const scripts = detectScripts(files, [
      { dir: '', name: 'root' },
      { dir: 'apps/web', name: 'web' },
    ]);
    expect(scripts.map((s) => `${s.scope}|${s.source}|${s.name}`)).toEqual([
      '|npm|test',
      '|composer|lint',
      '|make|deploy',
      '|just|fmt',
      '|melos|analyze',
      'apps/web|npm|dev',
    ]);
    expect(scripts[0]!.evidence).toEqual({
      file: 'package.json',
      pointer: '#scripts.test',
      line: 3,
    });
    expect(scripts[2]!.evidence).toEqual({ file: 'Makefile', pointer: '#deploy', line: 1 });
    expect(scripts[4]!.evidence.line).toBe(3);
  });
});
