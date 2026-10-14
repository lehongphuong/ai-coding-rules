import type { Command } from 'commander';
import type { Rule } from '../../types.js';
import type { Bind, Ctx } from '../context.js';
import { formatEvidence, scopeLabel } from '../format.js';
import { buildRules, loadProject } from '../pipeline.js';

/** Exact id match wins; otherwise case-insensitive substring of the text. */
export function matchRules(rules: readonly Rule[], query: string): Rule[] {
  const exact = rules.filter((r) => r.id === query);
  if (exact.length) return exact;
  const q = query.toLowerCase();
  return rules.filter((r) => r.text.toLowerCase().includes(q));
}

export function renderRule(rule: Rule, ctx: Pick<Ctx, 'c'>): string {
  const { c } = ctx;
  const lines = [
    c.bold(rule.id) + (rule.inferred ? c.yellow(' (inferred)') : ''),
    `  ${c.dim('pack    ')} ${rule.pack}`,
    `  ${c.dim('scope   ')} ${scopeLabel(rule.scope)}`,
    `  ${c.dim('section ')} ${rule.section}`,
    `  ${c.dim('text    ')} ${rule.text}`,
    `  ${c.dim('evidence')}`,
  ];
  if (rule.evidence.length === 0) lines.push(c.dim('    (none)'));
  for (const e of rule.evidence) lines.push(`    - ${formatEvidence(e)}`);
  return lines.join('\n');
}

export function runExplain(ctx: Ctx, _opts: unknown, args: string[]): number {
  const query = (args[0] ?? '').trim();
  const rules = matchRules(buildRules(loadProject(ctx.cwd)).rules, query);
  if (ctx.json) {
    ctx.print(JSON.stringify({ query, rules }, null, 2));
  } else if (rules.length) {
    ctx.print(rules.map((r) => renderRule(r, ctx)).join('\n\n'));
  }
  if (rules.length === 0) {
    ctx.io.stderr(`No rule matches "${query}". Try a rule id (e.g. "common/commands") or a word from its text.\n`);
    return 1;
  }
  return 0;
}

export function registerExplain(program: Command, bind: Bind): void {
  program
    .command('explain')
    .description('show where a rule comes from (match by id or text)')
    .argument('<query>', 'rule id or text fragment')
    .action(bind(runExplain));
}
