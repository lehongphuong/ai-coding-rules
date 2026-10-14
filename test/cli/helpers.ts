import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createMemoryFileIndex } from '../../src/core/file-index.js';
import type { CliIO } from '../../src/cli/index.js';
import type {
  Fact,
  Finding,
  ProjectFacts,
  RenderedFile,
  Rule,
  RuleSet,
  TargetId,
  WritePlan,
  WriteStatus,
} from '../../src/types.js';

export interface Captured {
  io: Partial<CliIO>;
  stdout: () => string;
  stderr: () => string;
}

export function captureIO(cwd: string, overrides: Partial<CliIO> = {}): Captured {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      stdout: (s) => out.push(s),
      stderr: (s) => err.push(s),
      cwd,
      isTTY: false,
      env: {},
      ...overrides,
    },
    stdout: () => out.join(''),
    stderr: () => err.join(''),
  };
}

const fact = (f: Partial<Fact> & Pick<Fact, 'key' | 'value'>): Fact => ({
  confidence: 1,
  evidence: [],
  scope: '',
  ...f,
});

export function fakeFacts(root: string): ProjectFacts {
  return {
    root,
    name: 'demo-app',
    description: 'A demo monorepo',
    files: createMemoryFileIndex({ 'package.json': '{}' }, root),
    workspaces: [
      { dir: '', name: 'demo-app', manifest: 'package.json' },
      { dir: 'apps/api', name: '@demo/api', manifest: 'apps/api/package.json' },
    ],
    facts: [
      fact({ key: 'language', value: 'typescript', evidence: [{ file: 'tsconfig.json' }] }),
      fact({ key: 'packageManager', value: 'pnpm', evidence: [{ file: 'pnpm-lock.yaml' }] }),
      fact({
        key: 'command',
        value: 'pnpm test',
        meta: { kind: 'test', name: 'test' },
        evidence: [{ file: 'package.json', pointer: '#scripts.test' }],
      }),
      fact({
        key: 'framework',
        value: 'nestjs',
        scope: 'apps/api',
        meta: { version: '10.2.0' },
        evidence: [{ file: 'apps/api/package.json', pointer: '#dependencies.@nestjs/core' }],
      }),
      fact({ key: 'agentFile', value: '.cursor/rules/old.mdc', meta: { target: 'cursor' }, evidence: [{ file: '.cursor/rules/old.mdc' }] }),
    ],
    scripts: [{ source: 'npm', name: 'test', scope: '', evidence: { file: 'package.json', pointer: '#scripts.test' } }],
  };
}

const rule = (r: Partial<Rule> & Pick<Rule, 'id' | 'text'>): Rule => ({
  section: 'dos-donts',
  scope: '',
  pack: r.id.split('/')[0]!,
  evidence: [],
  priority: 50,
  ...r,
});

export function fakeRuleSet(): RuleSet {
  return {
    project: { name: 'demo-app' },
    scopes: [{ dir: '', name: 'demo-app', summary: 'TypeScript · pnpm' }],
    rules: [
      rule({
        id: 'common/package-manager',
        section: 'commands',
        text: 'Use `pnpm` for all package commands; never use npm or yarn.',
        evidence: [{ file: 'pnpm-lock.yaml' }],
      }),
      rule({
        id: 'nestjs/modules',
        section: 'architecture',
        scope: 'apps/api',
        text: 'Group features into Nest modules.',
        evidence: [{ file: 'apps/api/package.json', pointer: '#dependencies.@nestjs/core', line: 12 }],
      }),
    ],
  };
}

/** One file per target, like a minimal renderer. */
export function fakeRender(_rs: RuleSet, targets: readonly TargetId[]): RenderedFile[] {
  const paths: Record<TargetId, string> = {
    agents: 'AGENTS.md',
    claude: 'CLAUDE.md',
    cursor: '.cursor/rules/root-overview.mdc',
    copilot: '.github/copilot-instructions.md',
    gemini: 'GEMINI.md',
  };
  return targets.map((target) => ({ path: paths[target], target, blocks: [{ id: 'overview', content: '# demo' }] }));
}

/** planWrites fake: status per path from `statuses` (default create). */
export function fakePlanner(statuses: Record<string, WriteStatus> = {}) {
  return (_root: string, files: readonly RenderedFile[], opts: { force?: boolean } = {}): WritePlan[] =>
    files.map((f) => {
      let status = statuses[f.path] ?? 'create';
      if (status === 'conflict' && opts.force) status = 'update';
      return {
        path: f.path,
        target: f.target,
        status,
        content: `content of ${f.path}\n`,
        diff: status === 'unchanged' ? '' : `--- a/${f.path}\n+++ b/${f.path}\n+content\n`,
        conflicts: status === 'conflict' ? ['commands'] : [],
      };
    });
}

/** applyPlans fake that really writes create/update plans. */
export function fakeApply(root: string, plans: readonly WritePlan[]): string[] {
  const written: string[] = [];
  for (const p of plans) {
    if (p.status !== 'create' && p.status !== 'update') continue;
    mkdirSync(dirname(join(root, p.path)), { recursive: true });
    writeFileSync(join(root, p.path), p.content);
    written.push(p.path);
  }
  return written;
}

export const sampleFindings: Finding[] = [
  { checkId: 'conflict/repo', severity: 'error', message: 'says npm but repo uses pnpm', file: 'CLAUDE.md', line: 3 },
  { checkId: 'stale/path', severity: 'warning', message: '`src/old.ts` does not exist', file: 'AGENTS.md', line: 9 },
  { checkId: 'budget', severity: 'info', message: 'Claude Code ≈ 1.2k tokens', file: 'CLAUDE.md' },
];
