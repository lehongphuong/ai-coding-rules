import type { DetectContext, Detector, Evidence, Fact, FactKey, FileIndex } from '../../types.js';
import { joinPath } from '../../core/index.js';
import {
  cleanVersion,
  ev,
  fact,
  firstExisting,
  inferKind,
  isRecord,
  readJsonc,
  stringMap,
} from '../util.js';

export type NodePm = 'npm' | 'pnpm' | 'yarn' | 'bun';

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

const LOCKFILES: [string, NodePm][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
];

export interface PmResolution {
  pm: NodePm;
  evidence: Evidence;
  confidence: number;
  /** True if this scope owns the evidence (and should emit packageManager + install). */
  own: boolean;
}

interface Dep {
  name: string;
  version: string;
  evidence: Evidence;
}

type DepLookup = (name: string) => Dep | undefined;

function depLookup(pkg: Record<string, unknown>, pkgPath: string): DepLookup {
  return (name) => {
    for (const field of DEP_FIELDS) {
      const deps = stringMap(pkg, field);
      if (name in deps) {
        return { name, version: deps[name]!, evidence: ev(pkgPath, `#${field}.${name}`) };
      }
    }
    return undefined;
  };
}

function pmFromLockfile(files: FileIndex, dir: string): PmResolution | undefined {
  for (const [file, pm] of LOCKFILES) {
    const p = joinPath(dir, file);
    if (files.has(p)) return { pm, evidence: ev(p), confidence: 1, own: true };
  }
  return undefined;
}

function pmFromField(files: FileIndex, dir: string): PmResolution | undefined {
  const p = joinPath(dir, 'package.json');
  const field = files.readJson<Record<string, unknown>>(p)?.packageManager;
  if (typeof field !== 'string') return undefined;
  const name = field.split('@')[0] as NodePm;
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(name)) return undefined;
  return { pm: name, evidence: ev(p, '#packageManager'), confidence: 0.95, own: true };
}

/**
 * Package manager for a node scope: lockfile → `packageManager` field → npm.
 * Non-root scopes inherit the root's lockfile/field (own = false).
 */
export function resolveNodePm(files: FileIndex, dir: string): PmResolution {
  const local = pmFromLockfile(files, dir) ?? pmFromField(files, dir);
  if (local) return local;
  if (dir !== '') {
    const root = pmFromLockfile(files, '') ?? pmFromField(files, '');
    if (root) return { ...root, own: false };
  }
  return {
    pm: 'npm',
    evidence: ev(joinPath(dir, 'package.json')),
    confidence: 0.6,
    own: true,
  };
}

/** Shell command running package.json script `name` with `pm`. */
export function scriptCommand(pm: NodePm, name: string): string {
  switch (pm) {
    case 'pnpm':
      return `pnpm ${name}`;
    case 'yarn':
      return `yarn ${name}`;
    case 'bun':
      return `bun run ${name}`;
    case 'npm':
      return name === 'test' ? 'npm test' : `npm run ${name}`;
  }
}

const FRAMEWORKS: [string, string][] = [
  ['next', 'nextjs'],
  ['react', 'react'],
  ['nuxt', 'nuxt'],
  ['vue', 'vue'],
  ['@angular/core', 'angular'],
  ['@sveltejs/kit', 'svelte'],
  ['svelte', 'svelte'],
  ['@nestjs/core', 'nestjs'],
  ['express', 'express'],
  ['fastify', 'fastify'],
];

const TEST_RUNNERS: [string, string][] = [
  ['jest', 'jest'],
  ['vitest', 'vitest'],
  ['mocha', 'mocha'],
  ['@playwright/test', 'playwright'],
  ['cypress', 'cypress'],
];

const TEST_CONFIGS: [string, string][] = [
  ['jest.config', 'jest'],
  ['vitest.config', 'vitest'],
  ['playwright.config', 'playwright'],
  ['cypress.config', 'cypress'],
  ['.mocharc', 'mocha'],
];

const ORMS: [string, string][] = [
  ['prisma', 'prisma'],
  ['@prisma/client', 'prisma'],
  ['typeorm', 'typeorm'],
  ['drizzle-orm', 'drizzle'],
  ['mongoose', 'mongoose'],
  ['sequelize', 'sequelize'],
];

const STATE: [string, string][] = [
  ['@reduxjs/toolkit', 'redux'],
  ['redux', 'redux'],
  ['zustand', 'zustand'],
  ['pinia', 'pinia'],
  ['mobx', 'mobx'],
];

const STYLING: [string, string][] = [
  ['tailwindcss', 'tailwind'],
  ['styled-components', 'styled-components'],
  ['sass', 'sass'],
];

const ESLINT_CONFIGS = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
];

const PRETTIER_CONFIGS = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
];

const BIOME_CONFIGS = ['biome.json', 'biome.jsonc'];

/** Facts for each dependency in `table` present in the manifest. */
function fromDeps(
  key: FactKey,
  table: [string, string][],
  dep: DepLookup,
  scope: string,
  withVersion = false,
): Fact[] {
  const out: Fact[] = [];
  for (const [name, value] of table) {
    const d = dep(name);
    if (!d) continue;
    const version = withVersion ? cleanVersion(d.version) : undefined;
    out.push(fact(key, value, scope, [d.evidence], 0.95, version ? { version } : undefined));
  }
  return out;
}

/** Config-file presence (`<base>.{js,ts,mjs,cjs,json}`) in `dir`. */
function configFile(files: FileIndex, dir: string, base: string): string | undefined {
  return firstExisting(
    files,
    dir,
    ['', '.js', '.ts', '.mjs', '.cjs', '.mts', '.json', '.yml', '.yaml'].map((x) => base + x),
  );
}

function detectTooling(
  files: FileIndex,
  dir: string,
  dep: DepLookup,
  pkgPath: string,
  pkg: Record<string, unknown>,
): Fact[] {
  const out: Fact[] = [];
  for (const [base, runner] of TEST_CONFIGS) {
    const p = configFile(files, dir, base);
    if (p) out.push(fact('testRunner', runner, dir, [ev(p)], 0.95, { config: p }));
  }
  out.push(...fromDeps('testRunner', TEST_RUNNERS, dep, dir));

  const eslintCfg = firstExisting(files, dir, ESLINT_CONFIGS);
  const eslintDep = dep('eslint');
  if (eslintCfg || eslintDep || isRecord(pkg.eslintConfig)) {
    const evidence = [eslintCfg ? ev(eslintCfg) : undefined, eslintDep?.evidence].filter(isEv);
    if (evidence.length === 0) evidence.push(ev(pkgPath, '#eslintConfig'));
    out.push(
      fact('linter', 'eslint', dir, evidence, 0.95, eslintCfg ? { config: eslintCfg } : undefined),
    );
  }

  const prettierCfg = firstExisting(files, dir, PRETTIER_CONFIGS);
  const prettierDep = dep('prettier');
  if (prettierCfg || prettierDep || pkg.prettier !== undefined) {
    const evidence = [prettierCfg ? ev(prettierCfg) : undefined, prettierDep?.evidence].filter(
      isEv,
    );
    if (evidence.length === 0) evidence.push(ev(pkgPath, '#prettier'));
    out.push(
      fact(
        'formatter',
        'prettier',
        dir,
        evidence,
        0.95,
        prettierCfg ? { config: prettierCfg } : undefined,
      ),
    );
  }

  const biomeCfg = firstExisting(files, dir, BIOME_CONFIGS);
  const biomeDep = dep('@biomejs/biome');
  if (biomeCfg || biomeDep) {
    const evidence = [biomeCfg ? ev(biomeCfg) : undefined, biomeDep?.evidence].filter(isEv);
    const meta = biomeCfg ? { config: biomeCfg } : undefined;
    out.push(fact('linter', 'biome', dir, evidence, 0.95, meta));
    out.push(fact('formatter', 'biome', dir, evidence, 0.95, meta));
  }
  return out;
}

function isEv(e: Evidence | undefined): e is Evidence {
  return e !== undefined;
}

function detectLanguage(files: FileIndex, dir: string, dep: DepLookup, pkgPath: string): Fact[] {
  const tsconfig = joinPath(dir, 'tsconfig.json');
  const tsDep = dep('typescript');
  const out: Fact[] = [];
  if (files.has(tsconfig) || tsDep) {
    const evidence = [files.has(tsconfig) ? ev(tsconfig) : undefined, tsDep?.evidence].filter(isEv);
    const version = cleanVersion(tsDep?.version);
    out.push(
      fact('language', 'typescript', dir, evidence, 0.95, version ? { version } : undefined),
    );
    const tsc = readJsonc(files, tsconfig);
    const strict = isRecord(tsc?.compilerOptions) ? tsc.compilerOptions.strict : undefined;
    if (typeof strict === 'boolean') {
      out.push(
        fact('typescriptStrict', strict, dir, [ev(tsconfig, '#compilerOptions.strict')], 0.95),
      );
    }
  } else if (!isWorkspaceRoot(files, dir)) {
    out.push(fact('language', 'javascript', dir, [ev(pkgPath)], 0.9));
  }
  return out;
}

/** A monorepo root package.json usually only orchestrates; it says nothing about language. */
function isWorkspaceRoot(files: FileIndex, dir: string): boolean {
  const pkg = files.readJson<Record<string, unknown>>(joinPath(dir, 'package.json'));
  return files.has(joinPath(dir, 'pnpm-workspace.yaml')) || pkg?.workspaces !== undefined;
}

function detectRuntime(
  files: FileIndex,
  dir: string,
  pkg: Record<string, unknown>,
  pkgPath: string,
): Fact[] {
  const out: Fact[] = [];
  const engine = stringMap(pkg, 'engines').node;
  if (engine) {
    out.push(
      fact('runtime', 'node', dir, [ev(pkgPath, '#engines.node')], 0.95, { version: engine }),
    );
  }
  for (const name of ['.nvmrc', '.node-version']) {
    const p = joinPath(dir, name);
    const version = files.read(p)?.trim();
    if (version) out.push(fact('runtime', 'node', dir, [ev(p)], 0.95, { version }));
  }
  return out;
}

function detectStyling(files: FileIndex, dir: string, dep: DepLookup): Fact[] {
  const out = fromDeps('styling', STYLING, dep, dir);
  const tw = configFile(files, dir, 'tailwind.config');
  if (tw) out.push(fact('styling', 'tailwind', dir, [ev(tw)], 0.95));
  const roots = ['src/', 'app/', 'components/', 'pages/'].map((r) => joinPath(dir, r));
  const module = files.paths.find(
    (p) => /\.module\.(css|scss|sass)$/.test(p) && roots.some((r) => p.startsWith(r)),
  );
  if (module) out.push(fact('styling', 'css-modules', dir, [ev(module)], 0.8));
  return out;
}

function detectCommands(
  pm: PmResolution,
  dir: string,
  pkg: Record<string, unknown>,
  pkgPath: string,
): Fact[] {
  const out: Fact[] = [];
  if (pm.own) {
    out.push(
      fact('command', `${pm.pm} install`, dir, [pm.evidence], pm.confidence, {
        kind: 'install',
        name: 'install',
      }),
    );
  }
  for (const name of Object.keys(stringMap(pkg, 'scripts'))) {
    const kind = inferKind(name);
    if (!kind) continue;
    out.push(
      fact('command', scriptCommand(pm.pm, name), dir, [ev(pkgPath, `#scripts.${name}`)], 0.95, {
        kind,
        name,
      }),
    );
  }
  return out;
}

function detectPm(pm: PmResolution, dir: string): Fact[] {
  if (!pm.own) return [];
  return [fact('packageManager', pm.pm, dir, [pm.evidence], pm.confidence)];
}

/** JS/TS: package.json and friends. */
export const nodeDetector: Detector = {
  id: 'node',
  detect({ files, dir }: DetectContext): Fact[] {
    const pkgPath = joinPath(dir, 'package.json');
    const pkg = files.readJson<unknown>(pkgPath);
    if (!isRecord(pkg)) return [];
    const dep = depLookup(pkg, pkgPath);
    const pm = resolveNodePm(files, dir);
    const out: Fact[] = [
      ...detectLanguage(files, dir, dep, pkgPath),
      ...fromDeps('framework', FRAMEWORKS, dep, dir, true),
      ...detectPm(pm, dir),
      ...detectTooling(files, dir, dep, pkgPath, pkg),
      ...fromDeps('orm', ORMS, dep, dir),
      ...fromDeps('stateManagement', STATE, dep, dir),
      ...detectStyling(files, dir, dep),
      ...detectRuntime(files, dir, pkg, pkgPath),
      ...detectCommands(pm, dir, pkg, pkgPath),
    ];
    const schema = joinPath(dir, 'prisma/schema.prisma');
    if (files.has(schema)) out.push(fact('orm', 'prisma', dir, [ev(schema)], 0.95));
    return out;
  },
};
