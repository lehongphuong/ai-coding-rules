import type { CommandKind, Evidence, Fact } from '../../types.js';
import { code, displayName, joinList } from '../names.js';
import type { RulePack, RuleTemplate } from '../pack.js';
import { COMMAND_KIND_ORDER, type FactQuery } from '../query.js';
import { overviewSentence } from '../summary.js';
import { ev, firstFile, nodeExec } from './helpers.js';

const KIND_LABELS: Record<CommandKind, string> = {
  install: 'Install',
  dev: 'Dev',
  build: 'Build',
  test: 'Test',
  e2e: 'E2E',
  lint: 'Lint',
  format: 'Format',
  typecheck: 'Typecheck',
  migrate: 'Migrate',
  codegen: 'Codegen',
};

/** Package managers that compete within one ecosystem. */
const ECOSYSTEMS: string[][] = [
  ['npm', 'pnpm', 'yarn', 'bun'],
  ['pip', 'poetry', 'uv', 'pipenv'],
];

const E2E_RUNNERS = ['playwright', 'cypress'];

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** One template per command fact, ordered by kind. */
function commandTemplates(q: FactQuery): RuleTemplate[] {
  const out: RuleTemplate[] = [];
  const usedIds = new Set<string>();
  const perKind = new Map<string, number>();
  for (const cmd of q.commands()) {
    const kind = cmd.meta?.kind as CommandKind | undefined;
    const known = kind !== undefined && kind in KIND_LABELS;
    const n = perKind.get(kind ?? '') ?? 0;
    perKind.set(kind ?? '', n + 1);
    const name = cmd.meta?.name;
    let label = known ? KIND_LABELS[kind] : (name ?? 'Run');
    if (known && n > 0 && name) label += ` (${name})`;
    const base = `common/command-${slug(n === 0 && known ? kind : (name ?? String(cmd.value)))}`;
    let id = base;
    for (let i = 2; usedIds.has(id); i++) id = `${base}-${i}`;
    usedIds.add(id);
    const rank = known ? COMMAND_KIND_ORDER.indexOf(kind) : COMMAND_KIND_ORDER.length;
    out.push({
      id,
      section: 'commands',
      text: `${label}: ${code(String(cmd.value))}`,
      evidence: () => cmd.evidence,
      priority: 10 + rank * 10 + Math.min(n, 9),
    });
  }
  return out;
}

/** Binaries that identify a lint/format tool inside a command string. */
const TOOL_BINS: Record<string, string[]> = {
  eslint: ['eslint'],
  biome: ['biome'],
  prettier: ['prettier'],
  ruff: ['ruff'],
  'ruff-format': ['ruff'],
  black: ['black'],
  flake8: ['flake8'],
  pylint: ['pylint'],
  phpstan: ['phpstan'],
  larastan: ['phpstan', 'larastan'],
  pint: ['pint'],
  'php-cs-fixer': ['php-cs-fixer'],
  'golangci-lint': ['golangci-lint'],
  gofmt: ['gofmt', 'go fmt'],
  'flutter-lints': ['flutter analyze', 'dart analyze'],
  'very-good-analysis': ['flutter analyze', 'dart analyze'],
  'dart-format': ['dart format'],
  ktlint: ['ktlint'],
  detekt: ['detekt'],
};
const ALL_BINS = [...new Set([...Object.values(TOOL_BINS).flat(), 'go vet'])];

/** False when `cmd` visibly runs some other tool than `tools` (e.g. `go vet` for golangci-lint). */
function commandRunsTools(cmd: string, tools: string[]): boolean {
  const own = tools.flatMap((t) => TOOL_BINS[t] ?? []);
  const named = ALL_BINS.filter((b) => cmd.includes(b));
  return named.length === 0 || named.some((b) => own.includes(b));
}

/** "Prettier (`pnpm format`)", or just "`dart format .`" when the command names the tool. */
function toolWithCommand(q: FactQuery, tools: string[], kind: CommandKind): string {
  const names = [...new Set(tools.map(displayName))];
  const cmd = q
    .commands(kind)
    .map((c) => String(c.value))
    .find((c) => commandRunsTools(c, tools));
  if (!cmd) return joinList(names);
  if (names.length === 1 && cmd.toLowerCase().includes(names[0]!.toLowerCase())) return code(cmd);
  return `${joinList(names)} (${code(cmd)})`;
}

function testRunnerText(q: FactQuery): string {
  const runners = q.values('testRunner');
  const unit = runners.filter((r) => !E2E_RUNNERS.includes(r)).map(displayName);
  const e2e = runners.filter((r) => E2E_RUNNERS.includes(r)).map(displayName);
  if (unit.length && e2e.length) {
    return `Write unit tests with ${joinList(unit)} and end-to-end tests with ${joinList(e2e)}.`;
  }
  return `Write tests with ${joinList([...unit, ...e2e])}; do not introduce another test framework.`;
}

function envEvidence(q: FactQuery): Evidence[] {
  const out = q.fileEvidence('.env.example');
  const gitignore = q.path('.gitignore');
  const content = q.files.read(gitignore);
  if (content) {
    const lines = content.split(/\r?\n/);
    const i = lines.findIndex((l) => /^\/?\.env(\*|\..*)?$/.test(l.trim()));
    if (i !== -1) out.push({ file: gitignore, line: i + 1 });
  }
  return out;
}

function commandEvidence(q: FactQuery, kind: CommandKind): Evidence[] {
  return q.commands(kind).flatMap((f: Fact) => f.evidence);
}

export const commonPack: RulePack = {
  id: 'common',
  appliesTo: () => true,
  rules: [
    {
      id: 'common/overview',
      section: 'overview',
      priority: 10,
      text: overviewSentence,
      evidence: ['framework', 'language', 'packageManager'],
    },
    {
      id: 'common/stack',
      section: 'overview',
      priority: 20,
      text: (q) => {
        const parts = [
          ...q.values('orm').map((v) => `${displayName(v)} (ORM)`),
          ...q.values('stateManagement').map((v) => `${displayName(v)} (state)`),
          ...q.values('styling').map((v) => `${displayName(v)} (styling)`),
        ];
        return parts.length ? `Key libraries: ${parts.join(', ')}.` : '';
      },
      evidence: ['orm', 'stateManagement', 'styling'],
    },
    {
      id: 'common/package-manager',
      section: 'commands',
      priority: 1,
      when: (q) => ECOSYSTEMS.some((e) => e.includes(q.values('packageManager')[0] ?? '')),
      text: (q) => {
        const pm = q.values('packageManager')[0]!;
        const others = ECOSYSTEMS.find((e) => e.includes(pm))!.filter((p) => p !== pm);
        return `Use ${code(pm)} for all dependency commands; do not use ${joinList(others, 'or')}.`;
      },
      evidence: (q) => q.evidence('packageManager', q.values('packageManager')[0] ?? ''),
    },
    {
      id: 'common/formatter',
      section: 'code-style',
      priority: 10,
      when: (q) => q.has('formatter'),
      text: (q) =>
        `Format with ${toolWithCommand(q, q.values('formatter'), 'format')} before committing.`,
      evidence: (q) => [...q.evidence('formatter'), ...commandEvidence(q, 'format')],
    },
    {
      id: 'common/linter',
      section: 'code-style',
      priority: 20,
      when: (q) => q.has('linter'),
      text: (q) =>
        `Lint with ${toolWithCommand(q, q.values('linter'), 'lint')} and fix reported issues instead of disabling rules.`,
      evidence: (q) => [...q.evidence('linter'), ...commandEvidence(q, 'lint')],
    },
    {
      id: 'common/indent',
      section: 'code-style',
      priority: 30,
      text: (q) => {
        const v = q.values('indent')[0];
        if (!v) return '';
        return v === 'tab' ? 'Indent with tabs.' : `Indent with ${v} spaces.`;
      },
      evidence: ['indent'],
    },
    {
      id: 'common/typecheck',
      section: 'code-style',
      priority: 40,
      when: (q) => q.command('typecheck') !== undefined,
      text: (q) =>
        `Keep ${code(q.command('typecheck')!)} passing; fix type errors instead of suppressing them.`,
      evidence: ev({ command: 'typecheck' }),
    },
    {
      id: 'common/styling',
      section: 'code-style',
      priority: 50,
      text: (q) => {
        const s = q.values('styling');
        if (s.includes('tailwind')) {
          return 'Style with Tailwind utility classes; avoid new global CSS and inline `style` objects.';
        }
        if (s.includes('css-modules')) {
          return 'Style components with CSS Modules (`*.module.css`) placed next to the component.';
        }
        if (s.includes('styled-components')) {
          return 'Style components with styled-components; do not mix in other styling approaches.';
        }
        return '';
      },
      evidence: ['styling'],
    },
    {
      id: 'common/vite-env',
      section: 'dos-donts',
      priority: 40,
      when: (q) => q.has('framework', 'react') || q.has('framework', 'vue'),
      text: 'Expose client env vars only with the `VITE_` prefix and read them via `import.meta.env`.',
      evidence: (q) => {
        const f = firstFile(q, [
          'vite.config.ts',
          'vite.config.js',
          'vite.config.mts',
          'vite.config.mjs',
        ]);
        return f ? q.fileEvidence(f) : [];
      },
    },
    {
      id: 'common/prisma',
      section: 'architecture',
      priority: 60,
      when: (q) => q.has('orm', 'prisma'),
      text: (q) => {
        const schema = firstFile(q, ['prisma/schema.prisma']) ?? 'schema.prisma';
        const x = nodeExec(q);
        const migrate = q.command('migrate') ?? `${x} prisma migrate dev`;
        return `After editing ${code(schema)}, run ${code(`${x} prisma generate`)} and create a migration with ${code(migrate)}.`;
      },
      evidence: ['orm'],
    },
    {
      id: 'common/typeorm',
      section: 'architecture',
      priority: 60,
      when: (q) => q.has('orm', 'typeorm'),
      text: 'Change the database schema through TypeORM migrations; never rely on `synchronize: true` in production.',
      evidence: (q) => q.evidence('orm', 'typeorm'),
    },
    {
      id: 'common/drizzle',
      section: 'architecture',
      priority: 60,
      when: (q) => q.has('orm', 'drizzle'),
      text: 'Define tables in the Drizzle schema and generate SQL migrations with drizzle-kit; do not edit applied migrations.',
      evidence: (q) => q.evidence('orm', 'drizzle'),
    },
    {
      id: 'common/test-runner',
      section: 'testing',
      priority: 10,
      when: (q) => q.has('testRunner'),
      text: testRunnerText,
      evidence: ['testRunner'],
    },
    {
      id: 'common/test-before-finish',
      section: 'testing',
      priority: 20,
      when: (q) => q.command('test') !== undefined,
      text: (q) =>
        `Run ${code(q.command('test')!)} and make sure it passes before finishing a task.`,
      evidence: ev({ command: 'test' }),
    },
    {
      id: 'common/e2e',
      section: 'testing',
      priority: 30,
      when: (q) => q.command('e2e') !== undefined,
      text: (q) => `Run ${code(q.command('e2e')!)} when changing user-facing flows.`,
      evidence: ev({ command: 'e2e' }),
    },
    {
      id: 'common/ci',
      section: 'dos-donts',
      priority: 10,
      when: (q) => q.has('ci'),
      text: (q) =>
        `CI runs on ${joinList(q.values('ci').map(displayName))}; keep it green and never skip failing checks.`,
      evidence: ['ci'],
    },
    {
      id: 'common/no-secrets',
      section: 'security',
      priority: 10,
      text: (q) =>
        q.files.has(q.path('.env.example'))
          ? 'Never commit secrets or real `.env` files; add new variables to `.env.example` with placeholder values.'
          : 'Never commit secrets; keep them in git-ignored `.env` files.',
      evidence: envEvidence,
    },
  ],
  expand: commandTemplates,
};
