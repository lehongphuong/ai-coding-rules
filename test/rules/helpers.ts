import { createMemoryFileIndex } from '../../src/core/file-index.js';
import { defaultConfig } from '../../src/core/config-defaults.js';
import type {
  Evidence,
  Fact,
  FactKey,
  FactValue,
  ProjectFacts,
  ResolvedConfig,
  Workspace,
} from '../../src/types.js';

export interface FactOpts {
  scope?: string;
  confidence?: number;
  evidence?: Evidence[];
  meta?: Record<string, string>;
}

const DEFAULT_FILE: Partial<Record<FactKey, string>> = {
  indent: '.editorconfig',
  ci: '.github/workflows/ci.yml',
  typescriptStrict: 'tsconfig.json',
};

/** Build a fact with sensible default evidence. */
export function fact(key: FactKey, value: FactValue, opts: FactOpts = {}): Fact {
  const scope = opts.scope ?? '';
  const prefix = scope ? `${scope}/` : '';
  const file = `${prefix}${DEFAULT_FILE[key] ?? 'package.json'}`;
  const f: Fact = {
    key,
    value,
    confidence: opts.confidence ?? 1,
    evidence: opts.evidence ?? [{ file, pointer: `#${key}` }],
    scope,
  };
  if (opts.meta) f.meta = opts.meta;
  return f;
}

/** Command fact: `cmd('test', 'pnpm test')`. */
export function cmd(kind: string, value: string, opts: FactOpts & { name?: string } = {}): Fact {
  const name = opts.name ?? kind;
  const scope = opts.scope ?? '';
  return fact('command', value, {
    ...opts,
    meta: { kind, name },
    evidence: opts.evidence ?? [
      { file: `${scope ? `${scope}/` : ''}package.json`, pointer: `#scripts.${name}` },
    ],
  });
}

/** Facts scoped to `scope` (shorthand for many facts in one workspace). */
export function inScope(scope: string, facts: Fact[]): Fact[] {
  return facts.map((f) => {
    const prefix = scope ? `${scope}/` : '';
    return {
      ...f,
      scope,
      evidence: f.evidence.map((e) => ({ ...e, file: `${prefix}${e.file}` })),
    };
  });
}

export function project(
  facts: Fact[],
  workspaces: Workspace[] = [],
  files: Record<string, string> = {},
  name = 'demo',
): ProjectFacts {
  return {
    root: '/virtual',
    name,
    files: createMemoryFileIndex(files),
    facts,
    workspaces: [{ dir: '', name }, ...workspaces],
    scripts: [],
  };
}

export function config(patch: Partial<ResolvedConfig['rules']> = {}): ResolvedConfig {
  const c = defaultConfig();
  c.rules = { ...c.rules, ...patch };
  return c;
}
