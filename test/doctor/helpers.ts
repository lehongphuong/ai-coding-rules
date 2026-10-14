import { createMemoryFileIndex, defaultConfig } from '../../src/core/index.js';
import { extractClaims } from '../../src/doctor/claims.js';
import type { DoctorContext } from '../../src/doctor/context.js';
import { parseInstructionFiles } from '../../src/doctor/parser.js';
import type {
  Fact,
  FactKey,
  Finding,
  ProjectFacts,
  ResolvedConfig,
  ScriptDef,
  ScriptSource,
  Workspace,
} from '../../src/types.js';

export function fact(
  key: FactKey,
  value: string,
  opts: { scope?: string; confidence?: number; file?: string; pointer?: string } = {},
): Fact {
  return {
    key,
    value,
    confidence: opts.confidence ?? 1,
    scope: opts.scope ?? '',
    evidence: [{ file: opts.file ?? 'package.json', pointer: opts.pointer }],
  };
}

export function scripts(names: string[], source: ScriptSource = 'npm', scope = ''): ScriptDef[] {
  const manifest = source === 'npm' ? 'package.json' : source;
  return names.map((name) => ({
    source,
    name,
    scope,
    evidence: { file: scope ? `${scope}/${manifest}` : manifest },
  }));
}

export function project(
  files: Record<string, string>,
  opts: { facts?: Fact[]; scripts?: ScriptDef[]; workspaces?: Workspace[] } = {},
): ProjectFacts {
  return {
    root: '/virtual',
    name: 'demo',
    files: createMemoryFileIndex(files),
    facts: opts.facts ?? [],
    workspaces: [{ dir: '', name: 'demo' }, ...(opts.workspaces ?? [])],
    scripts: opts.scripts ?? [],
  };
}

export function context(
  facts: ProjectFacts,
  config: ResolvedConfig = defaultConfig(),
): DoctorContext {
  const docs = parseInstructionFiles(facts.files);
  return { facts, config, docs, claimsByDoc: new Map(docs.map((d) => [d.path, extractClaims(d)])) };
}

/** Compact "file:line checkId" view for assertions. */
export function brief(findings: Finding[]): string[] {
  return findings.map((f) => `${f.file}${f.line !== undefined ? `:${f.line}` : ''} ${f.checkId}`);
}

export const PNPM_VITEST: Fact[] = [
  fact('packageManager', 'pnpm', { file: 'pnpm-lock.yaml' }),
  fact('testRunner', 'vitest', { pointer: '#devDependencies.vitest' }),
  fact('language', 'typescript'),
];
