import { scopeOf } from '../../core/facts.js';
import type { Finding, InstructionDoc, ScriptSource } from '../../types.js';
import { dirname } from '../parser.js';
import { docScope, type DoctorContext } from '../context.js';

const NPM_BUILTINS = new Set(
  (
    'access adduser add audit bugs c cache ci cit clean-install completion config create ddp dedupe ' +
    'deprecate diff dist-tag docs doctor edit exec explain explore find find-dupes fund get help ' +
    'help-search home hook i init innit install install-ci-test install-test isntall it issues la link ' +
    'list ll ln login logout ls org outdated owner pack ping pkg prefix profile prune publish query r ' +
    'rb rebuild remove repo restart rm root s sbom se search set shrinkwrap star stars start stop t ' +
    'team test token tst un uninstall unlink unpublish unstar up update upgrade v version view whoami x'
  ).split(' '),
);
const NPM_RUN = new Set(['run', 'run-script', 'rum', 'urn']);

const PNPM_BUILTINS = new Set(
  (
    'add approve-builds audit bin c cat-file cat-index config create deploy dlx doctor env exec fetch ' +
    'find-hash i import init install install-test it licenses link list ll ln ls outdated pack patch ' +
    'patch-commit patch-remove prune publish rb rebuild recursive remove restart rm root run self-update ' +
    'server setup start store t test un uninstall unlink up update upgrade why'
  ).split(' '),
);

const YARN_BUILTINS = new Set(
  (
    'add audit autoclean bin cache check config constraints create dedupe dlx exec explain generate-lock-entry ' +
    'global help import info init install licenses link list login logout node npm outdated owner pack patch ' +
    'patch-commit plugin policies publish rebuild remove run search set stage start tag team test unlink ' +
    'unplug up upgrade upgrade-interactive version versions why workspace workspaces'
  ).split(' '),
);

const BUN_BUILTINS = new Set(
  (
    'a add audit build c create exec i info init install link outdated patch pm publish remove repl rm ' +
    'run test unlink update upgrade why x'
  ).split(' '),
);

const COMPOSER_BUILTINS = new Set(
  (
    'about archive audit browse bump check-platform-reqs clear-cache clearcache config create-project ' +
    'depends diagnose dump-autoload dumpautoload exec fund global help home i init install licenses list ' +
    'outdated prohibits r reinstall remove require rm run run-script search self-update selfupdate show ' +
    'status suggests u update upgrade validate why why-not'
  ).split(' '),
);

/** Names that are almost certainly scripts rather than binaries run through `pnpm x`. */
const SCRIPT_LIKE = new Set(
  (
    'build dev lint format fmt typecheck type-check check e2e serve preview clean generate codegen gen ' +
    'migrate seed storybook release deploy watch coverage ci'
  ).split(' '),
);

/** Flags that consume the next token. */
const VALUE_FLAGS = new Set([
  '--filter',
  '-F',
  '-C',
  '--dir',
  '--prefix',
  '--workspace',
  '--cwd',
  '-d',
  '--working-dir',
]);
/** Flags that make the command run in other workspaces. */
const ANY_SCOPE_FLAGS = new Set([
  '--filter',
  '-F',
  '-C',
  '--dir',
  '--prefix',
  '--workspace',
  '--workspaces',
  '-ws',
  '-w',
  '-r',
  '--recursive',
  '--cwd',
  '-d',
  '--working-dir',
]);

interface Lookup {
  ctx: DoctorContext;
  doc: InstructionDoc;
  /** Scopes whose scripts count (doc scope + root), or undefined = any scope. */
  scopes: Set<string> | undefined;
}

interface Problem {
  message: string;
  hint: string;
}

/** stale/command: referenced scripts / targets / recipes that don't exist. */
export function checkStaleCommand(ctx: DoctorContext): Finding[] {
  const { workspaces } = ctx.facts;
  const findings: Finding[] = [];
  for (const doc of ctx.docs) {
    const scope = docScope(doc, workspaces);
    const docCds = /(?:^|[\s`$&;(])cd\s+[\w./-]/m.test(doc.text);
    const seen = new Set<string>();
    for (const claim of ctx.claimsByDoc.get(doc.path) ?? []) {
      if (claim.key !== 'command' || claim.negated) continue;
      const id = `${claim.line}\u0000${claim.value}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const mentionsWorkspace = workspaces.some(
        (w) => w.dir !== '' && (claim.text.includes(w.dir) || claim.text.includes(w.name)),
      );
      const scopes =
        docCds || mentionsWorkspace
          ? undefined
          : new Set([scope, scopeOf(doc.path, workspaces), '']);
      const problem = analyze(claim.value, { ctx, doc, scopes });
      if (!problem) continue;
      findings.push({
        checkId: 'stale/command',
        severity: 'warning',
        file: doc.path,
        line: claim.line,
        message: `\`${claim.value}\` — ${problem.message}`,
        hint: problem.hint,
      });
    }
  }
  return findings;
}

/** Problem with one command, or undefined when it looks valid (or can't be checked). */
export function analyze(command: string, lookup: Lookup): Problem | undefined {
  const tokens = command.split(' ').filter((t) => !/^[A-Z_][A-Z0-9_]*=/.test(t));
  const [head, second] = tokens;
  switch (head) {
    case 'npm':
    case 'pnpm':
    case 'yarn':
    case 'bun':
      return analyzeJs(head, tokens.slice(1), lookup);
    case 'make':
      return analyzeMake(tokens.slice(1), lookup);
    case 'just':
      return analyzeJust(tokens.slice(1), lookup);
    case 'composer':
      return analyzeComposer(tokens.slice(1), lookup);
    case 'php':
      if (second !== 'artisan') return undefined;
      return dirsFor(lookup).some((d) => lookup.ctx.facts.files.has(join(d, 'artisan')))
        ? undefined
        : { message: 'no `artisan` file found', hint: 'Update or remove the command.' };
    case 'melos':
      return second === 'run' ? analyzeMelos(tokens.slice(2), lookup) : undefined;
    default:
      return undefined;
  }
}

interface Args {
  positionals: string[];
  anyScope: boolean;
}

function parseArgs(tokens: string[], valueFlags: readonly string[] = []): Args {
  const positionals: string[] = [];
  let anyScope = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === '--') {
      positionals.push(...tokens.slice(i + 1));
      break;
    }
    if (t.startsWith('-')) {
      const name = t.split('=')[0]!;
      if (ANY_SCOPE_FLAGS.has(name)) anyScope = true;
      if ((VALUE_FLAGS.has(name) || valueFlags.includes(name)) && !t.includes('=')) i++;
      continue;
    }
    positionals.push(t);
  }
  return { positionals, anyScope };
}

function analyzeJs(runner: string, tokens: string[], lookup: Lookup): Problem | undefined {
  // npm's -w takes a workspace; pnpm's -w (workspace root) is a plain switch.
  const { positionals, anyScope } = parseArgs(tokens, runner === 'npm' ? ['-w'] : []);
  const l = anyScope ? { ...lookup, scopes: undefined } : lookup;
  const [sub, name] = positionals;
  if (!sub) return undefined;
  const isFile = (s: string): boolean => s.includes('/') || /\.[a-z]+$/i.test(s);
  const has = (s: string): boolean => scriptNames(l, 'npm').has(s);
  const strictRun = runner === 'npm' || runner === 'pnpm';

  if (sub === 'run' || (runner === 'npm' && NPM_RUN.has(sub))) {
    if (!name || has(name) || (runner === 'bun' && isFile(name))) return undefined;
    if (!strictRun && !looksLikeScript(name)) return undefined; // yarn/bun run also runs binaries
    return missingScript(name, l, 'npm');
  }
  if (runner === 'yarn' && (sub === 'workspace' || sub === 'workspaces')) return undefined;
  const builtins =
    runner === 'npm'
      ? NPM_BUILTINS
      : runner === 'pnpm'
        ? PNPM_BUILTINS
        : runner === 'yarn'
          ? YARN_BUILTINS
          : BUN_BUILTINS;
  if (builtins.has(sub)) return undefined;
  if (runner === 'npm') {
    return has(sub)
      ? { message: `npm has no \`${sub}\` command`, hint: `Use \`npm run ${sub}\`.` }
      : {
          message: `npm has no \`${sub}\` command and no script \`${sub}\` is defined`,
          hint: hintScripts(l, 'npm'),
        };
  }
  // pnpm/yarn/bun <x>: runs script x, else a binary — only flag obvious script names.
  if (has(sub) || isFile(sub) || !looksLikeScript(sub)) return undefined;
  return missingScript(sub, l, 'npm');
}

function analyzeMake(tokens: string[], lookup: Lookup): Problem | undefined {
  if (tokens.some((t) => /^(?:-C|-f|--directory|--file|--makefile)/.test(t))) return undefined;
  const targets = tokens.filter((t) => !t.startsWith('-') && !t.includes('='));
  if (targets.length === 0) return undefined;
  const makefiles = findFiles(lookup, ['Makefile', 'makefile', 'GNUmakefile']);
  if (makefiles.length === 0) {
    return { message: 'no Makefile found', hint: 'Update or remove the command.' };
  }
  const names = scriptNames(lookup, 'make');
  for (const mf of makefiles) {
    const text = lookup.ctx.facts.files.read(mf) ?? '';
    // Included makefiles or pattern rules: targets can't be known statically.
    if (/^-?include\s/m.test(text) || /^[^\s#=]*%[^=\n]*:/m.test(text)) return undefined;
    for (const m of text.matchAll(/^([^\s:#=][^:=\n]*?)\s*::?(?!=)/gm)) {
      m[1]!.split(/\s+/).forEach((n) => names.add(n));
    }
  }
  const missing = targets.find((t) => !names.has(t));
  if (!missing) return undefined;
  return {
    message: `target \`${missing}\` is not defined in ${makefiles.join(', ')}`,
    hint: hintList([...names].filter((n) => !n.startsWith('.'))),
  };
}

function analyzeJust(tokens: string[], lookup: Lookup): Problem | undefined {
  if (tokens.some((t) => /^(?:-f|--justfile|-d|--working-directory)/.test(t))) return undefined;
  const recipe = tokens.find((t) => !t.startsWith('-'));
  if (!recipe) return undefined;
  const justfiles = findFiles(lookup, ['justfile', 'Justfile', '.justfile']);
  if (justfiles.length === 0) {
    return { message: 'no justfile found', hint: 'Update or remove the command.' };
  }
  const names = scriptNames(lookup, 'just');
  for (const jf of justfiles) {
    const text = lookup.ctx.facts.files.read(jf) ?? '';
    if (/^(?:import|mod)\s/m.test(text)) return undefined;
    for (const m of text.matchAll(/^@?([\w-]+)[^\n:=]*:(?!=)/gm)) names.add(m[1]!);
    for (const m of text.matchAll(/^alias\s+([\w-]+)\s*:=/gm)) names.add(m[1]!);
  }
  if (names.has(recipe)) return undefined;
  return {
    message: `recipe \`${recipe}\` is not defined in ${justfiles.join(', ')}`,
    hint: hintList([...names]),
  };
}

function analyzeComposer(tokens: string[], lookup: Lookup): Problem | undefined {
  const { positionals, anyScope } = parseArgs(tokens);
  if (anyScope) return undefined;
  const [sub, name] = positionals;
  if (!sub) return undefined;
  const has = (s: string): boolean => scriptNames(lookup, 'composer').has(s);
  if (sub === 'run' || sub === 'run-script') {
    if (!name || has(name)) return undefined;
    return missingScript(name, lookup, 'composer');
  }
  if (COMPOSER_BUILTINS.has(sub) || has(sub) || !looksLikeScript(sub)) return undefined;
  return missingScript(sub, lookup, 'composer');
}

function analyzeMelos(tokens: string[], lookup: Lookup): Problem | undefined {
  const name = tokens.find((t) => !t.startsWith('-'));
  if (!name || scriptNames(lookup, 'melos').has(name)) return undefined;
  return missingScript(name, lookup, 'melos');
}

const MANIFEST: Record<ScriptSource, string> = {
  npm: 'package.json',
  composer: 'composer.json',
  make: 'Makefile',
  just: 'justfile',
  melos: 'melos.yaml',
};

function missingScript(name: string, lookup: Lookup, source: ScriptSource): Problem {
  return {
    message: `script \`${name}\` is not defined in ${MANIFEST[source]}`,
    hint: hintScripts(lookup, source),
  };
}

function hintScripts(lookup: Lookup, source: ScriptSource): string {
  return hintList([...scriptNames(lookup, source)]);
}

function hintList(names: string[]): string {
  if (names.length === 0) return 'Update or remove the command.';
  const sorted = [...new Set(names)].sort();
  const shown = sorted.slice(0, 10).join(', ');
  return `Available: ${shown}${sorted.length > 10 ? ', …' : ''}. Update or remove the command.`;
}

function scriptNames(lookup: Lookup, source: ScriptSource): Set<string> {
  return new Set(
    lookup.ctx.facts.scripts
      .filter((s) => s.source === source && (!lookup.scopes || lookup.scopes.has(s.scope)))
      .map((s) => s.name),
  );
}

function looksLikeScript(name: string): boolean {
  return name.includes(':') || SCRIPT_LIKE.has(name);
}

/** Directories to look for Makefile/justfile/artisan in. */
function dirsFor(lookup: Lookup): string[] {
  if (!lookup.scopes) return lookup.ctx.facts.workspaces.map((w) => w.dir);
  return [...new Set([...lookup.scopes, dirname(lookup.doc.path)])];
}

function findFiles(lookup: Lookup, names: string[]): string[] {
  const out: string[] = [];
  for (const d of dirsFor(lookup)) {
    for (const n of names) {
      const p = join(d, n);
      if (lookup.ctx.facts.files.has(p) && !out.includes(p)) out.push(p);
    }
  }
  return out;
}

function join(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}
