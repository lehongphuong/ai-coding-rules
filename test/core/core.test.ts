import { describe, expect, it } from 'vitest';
import {
  agentsForFile,
  createMemoryFileIndex,
  dedupeFacts,
  matchGlob,
  scopeOf,
  shortHash,
} from '../../src/core/index.js';

describe('glob', () => {
  it('matches ** and *', () => {
    expect(matchGlob('AGENTS.md', '**/AGENTS.md')).toBe(true);
    expect(matchGlob('apps/api/AGENTS.md', '**/AGENTS.md')).toBe(true);
    expect(matchGlob('.cursor/rules/a/b.mdc', '.cursor/rules/**/*.mdc')).toBe(true);
    expect(matchGlob('src/a.ts', 'src/*.{ts,js}')).toBe(true);
    expect(matchGlob('src/x/a.ts', 'src/*.ts')).toBe(false);
  });
});

describe('memory file index', () => {
  const files = createMemoryFileIndex({
    'package.json': '{"name":"x"}',
    'apps/api/package.json': '{bad json',
    'apps/api/src/main.ts': '',
  });
  it('reads and lists', () => {
    expect(files.readJson<{ name: string }>('package.json')?.name).toBe('x');
    expect(files.readJson('apps/api/package.json')).toBeUndefined();
    expect(files.hasDir('apps/api')).toBe(true);
    expect(files.hasDir('apps/web')).toBe(false);
    expect(files.list('apps')).toEqual(['api']);
    expect(files.glob('**/package.json')).toEqual(['apps/api/package.json', 'package.json']);
  });
});

describe('facts helpers', () => {
  it('dedupes and scopes', () => {
    const f = dedupeFacts([
      {
        key: 'language',
        value: 'typescript',
        confidence: 0.9,
        evidence: [{ file: 'a' }],
        scope: '',
      },
      { key: 'language', value: 'typescript', confidence: 1, evidence: [{ file: 'b' }], scope: '' },
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]!.evidence).toHaveLength(2);
    expect(
      scopeOf('apps/api/src/x.ts', [
        { dir: '', name: 'r' },
        { dir: 'apps/api', name: 'a' },
      ]),
    ).toBe('apps/api');
  });
  it('maps agent files and hashes', () => {
    expect(agentsForFile('CLAUDE.md')).toEqual(['claude']);
    expect(agentsForFile('src/index.ts')).toEqual([]);
    expect(shortHash(' a ')).toBe(shortHash('a'));
  });
});
