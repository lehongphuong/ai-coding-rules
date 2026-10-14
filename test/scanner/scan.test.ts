import { describe, expect, it } from 'vitest';
import { createMemoryFileIndex } from '../../src/core/index.js';
import { scanFiles } from '../../src/scanner/index.js';
import { json } from './helpers.js';

describe('scanFiles', () => {
  it('merges duplicate facts and fills name/description', () => {
    const files = createMemoryFileIndex(
      {
        'package.json': json({
          name: 'app',
          description: 'An app',
          devDependencies: { jest: '29' },
        }),
        'jest.config.js': '',
        'yarn.lock': '',
      },
      '/tmp/whatever',
    );
    const p = scanFiles(files);
    expect(p.name).toBe('app');
    expect(p.description).toBe('An app');
    expect(p.root).toBe('/tmp/whatever');
    const jest = p.facts.filter((f) => f.key === 'testRunner');
    expect(jest).toHaveLength(1);
    expect(jest[0]!.evidence.map((e) => e.file)).toEqual(['jest.config.js', 'package.json']);
  });

  it('falls back to the folder name and pubspec/composer names', () => {
    expect(scanFiles(createMemoryFileIndex({ 'main.go': '' }, '/x/my-tool')).name).toBe('my-tool');
    expect(scanFiles(createMemoryFileIndex({ 'pubspec.yaml': 'name: dart_pkg\n' })).name).toBe(
      'dart_pkg',
    );
    expect(scanFiles(createMemoryFileIndex({ 'composer.json': json({ name: 'a/b' }) })).name).toBe(
      'a/b',
    );
  });

  it('handles a polyglot repo without monorepo tooling', () => {
    const p = scanFiles(
      createMemoryFileIndex({
        'mobile/pubspec.yaml': 'name: m\ndependencies:\n  flutter:\n    sdk: flutter\n',
        'api/package.json': json({
          dependencies: { '@nestjs/core': '10' },
          scripts: { test: 'jest' },
        }),
        'api/pnpm-lock.yaml': '',
      }),
    );
    expect(p.workspaces.map((w) => w.dir)).toEqual(['', 'api', 'mobile']);
    const fw = p.facts.filter((f) => f.key === 'framework').map((f) => `${f.scope}:${f.value}`);
    expect(fw).toEqual(['api:nestjs', 'mobile:flutter']);
    expect(
      p.facts.find((f) => f.key === 'command' && f.scope === 'api' && f.meta?.kind === 'test')
        ?.value,
    ).toBe('pnpm test');
  });

  it('scans 5,000 files in under a second', () => {
    const contents: Record<string, string> = {
      'package.json': json({ name: 'big', workspaces: ['packages/*'] }),
      'package-lock.json': '{}',
      '.editorconfig': '[*]\nindent_size = 2\n',
    };
    for (let p = 0; p < 50; p++) {
      contents[`packages/p${p}/package.json`] = json({
        name: `p${p}`,
        scripts: { test: 'vitest', build: 'tsc' },
        devDependencies: { vitest: '2', typescript: '5' },
      });
      contents[`packages/p${p}/tsconfig.json`] = '{"compilerOptions":{"strict":true}}';
      for (let i = 0; i < 98; i++)
        contents[`packages/p${p}/src/dir${i % 7}/file${i}.ts`] = 'export {};';
    }
    const files = createMemoryFileIndex(contents);
    expect(files.paths.length).toBeGreaterThanOrEqual(5000);
    const start = performance.now();
    const p = scanFiles(files);
    const elapsed = performance.now() - start;
    expect(p.workspaces).toHaveLength(51);
    expect(elapsed).toBeLessThan(1000);
  });
});
