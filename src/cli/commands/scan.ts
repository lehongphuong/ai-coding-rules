import type { Command } from 'commander';
import type { Fact, FactKey, ProjectFacts } from '../../types.js';
import type { Bind, Ctx } from '../context.js';
import { columns, formatEvidence, scopeLabel } from '../format.js';
import { loadProject } from '../pipeline.js';

/** Display order and labels for non-command facts. */
const LABELS: [FactKey, string][] = [
  ['language', 'language'],
  ['framework', 'framework'],
  ['runtime', 'runtime'],
  ['packageManager', 'package manager'],
  ['monorepo', 'monorepo'],
  ['testRunner', 'test runner'],
  ['linter', 'linter'],
  ['formatter', 'formatter'],
  ['typescriptStrict', 'ts strict'],
  ['orm', 'orm'],
  ['stateManagement', 'state'],
  ['styling', 'styling'],
  ['indent', 'indent'],
  ['ci', 'ci'],
  ['agentFile', 'agent file'],
];

function evidenceOf(f: Fact, max = 2): string {
  const shown = f.evidence.slice(0, max).map((e) => formatEvidence(e, false));
  const more = f.evidence.length > max ? `, +${f.evidence.length - max} more` : '';
  return shown.length ? `(${shown.join(', ')}${more})` : '';
}

function valueOf(f: Fact): string {
  const version = f.meta?.version ? ` ${f.meta.version}` : '';
  const target = f.key === 'agentFile' && f.meta?.target ? ` [${f.meta.target}]` : '';
  return `${String(f.value)}${version}${target}`;
}

/** `scan --json` payload: ProjectFacts without the file index. */
export function scanJson(facts: ProjectFacts): Omit<ProjectFacts, 'files' | 'root'> {
  const { name, description, workspaces, facts: list, scripts } = facts;
  return { name, description, workspaces, facts: list, scripts };
}

/** Human scan report grouped by scope. */
export function renderScan(facts: ProjectFacts, ctx: Pick<Ctx, 'c'>): string {
  const { c } = ctx;
  const out: string[] = [];
  out.push(c.bold(facts.name) + (facts.description ? c.dim(` — ${facts.description}`) : ''));
  for (const ws of facts.workspaces) {
    const scoped = facts.facts.filter((f) => f.scope === ws.dir);
    if (scoped.length === 0 && ws.dir !== '') continue;
    const name = ws.dir && ws.name && ws.name !== ws.dir ? c.dim(` (${ws.name})`) : '';
    out.push('', c.underline(c.bold(scopeLabel(ws.dir))) + name);

    const rows: string[][] = [];
    for (const [key, label] of LABELS) {
      for (const f of scoped.filter((x) => x.key === key)) {
        const ev = evidenceOf(f);
        rows.push([`  ${label}`, `: ${valueOf(f)}${ev ? `  ${c.dim(ev)}` : ''}`]);
      }
    }
    out.push(...columns(rows, ' '));
    if (rows.length === 0) out.push(c.dim('  (no facts detected)'));

    const commands = scoped.filter((f) => f.key === 'command');
    if (commands.length) {
      out.push('  commands:');
      out.push(
        ...columns(
          commands.map((f) => [
            `    ${f.meta?.kind ?? f.meta?.name ?? ''}`,
            c.cyan(String(f.value)),
            c.dim(evidenceOf(f, 1)),
          ]),
        ),
      );
    }
  }
  const scripts = facts.scripts.length;
  out.push(
    '',
    c.dim(
      `${facts.workspaces.length} workspace(s) · ${facts.facts.length} facts · ${scripts} script(s)`,
    ),
  );
  return out.join('\n');
}

export function runScan(ctx: Ctx): number {
  const { facts } = loadProject(ctx.cwd);
  if (ctx.json) ctx.print(JSON.stringify(scanJson(facts), null, 2));
  else ctx.print(renderScan(facts, ctx));
  return 0;
}

export function registerScan(program: Command, bind: Bind): void {
  program
    .command('scan')
    .description('detect the stack, commands and conventions (read-only)')
    .action(bind(runScan));
}
