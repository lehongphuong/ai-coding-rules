import type { Command } from 'commander';
import type { WritePlan, WriteStatus } from '../../types.js';
import { applyPlans } from '../../writer/index.js';
import type { Bind, Colors, Ctx } from '../context.js';
import { columns } from '../format.js';
import { loadProject, parseTargets, planGeneration, type Project } from '../pipeline.js';

export interface GenerateOptions {
  target?: string;
  dryRun?: boolean;
  diff?: boolean;
  force?: boolean;
  withEvidence?: boolean;
  ai?: boolean;
}

export interface GenerateHooks {
  /** Already loaded project (init passes it to avoid rescanning). */
  project?: Project;
  /** Asked when plans have conflicts; true → re-plan with force. */
  confirmForce?: (conflicts: WritePlan[]) => Promise<boolean>;
}

export function statusColor(c: Colors, status: WriteStatus, text: string = status): string {
  switch (status) {
    case 'create':
      return c.green(text);
    case 'update':
      return c.cyan(text);
    case 'conflict':
      return c.red(text);
    default:
      return c.dim(text);
  }
}

/** `status  path` table lines. */
export function renderPlanTable(plans: readonly WritePlan[], c: Colors): string[] {
  const width = Math.max(...plans.map((p) => p.status.length));
  return columns(
    plans.map((p) => [
      `  ${statusColor(c, p.status, p.status.padEnd(width))}`,
      p.path + (p.conflicts.length ? c.dim(`  (edited by hand: ${p.conflicts.join(', ')})`) : ''),
    ]),
  );
}

function count(plans: readonly WritePlan[], status: WriteStatus): number {
  return plans.filter((p) => p.status === status).length;
}

/** Shared by `generate` and `init`. */
export async function runGenerate(ctx: Ctx, opts: GenerateOptions, hooks: GenerateHooks = {}): Promise<number> {
  const { c } = ctx;
  const project = hooks.project ?? loadProject(ctx.cwd);
  const genOpts = {
    targets: parseTargets(opts.target),
    force: opts.force,
    withEvidence: opts.withEvidence,
    ai: opts.ai,
    env: ctx.io.env,
    warn: ctx.warn,
  };
  let gen = await planGeneration(project, genOpts);
  let conflicts = gen.plans.filter((p) => p.status === 'conflict');
  if (conflicts.length && !opts.force && hooks.confirmForce && (await hooks.confirmForce(conflicts))) {
    gen = await planGeneration(project, { ...genOpts, force: true, ruleSet: gen.ruleSet });
    conflicts = gen.plans.filter((p) => p.status === 'conflict');
  }
  const { plans } = gen;
  const written = opts.dryRun ? [] : applyPlans(ctx.cwd, plans);

  if (ctx.json) {
    ctx.print(
      JSON.stringify(
        {
          dryRun: Boolean(opts.dryRun),
          targets: gen.targets,
          plans: plans.map((p) => ({
            path: p.path,
            target: p.target,
            status: p.status,
            conflicts: p.conflicts,
            ...(opts.diff ? { diff: p.diff } : {}),
          })),
          written,
        },
        null,
        2,
      ),
    );
  } else {
    if (plans.length === 0) ctx.info(c.dim('No files to generate for targets: ' + gen.targets.join(', ')));
    else if (!ctx.quiet) ctx.print(renderPlanTable(plans, c).join('\n'));
    if (opts.diff) {
      for (const p of plans) if (p.diff) ctx.print(`\n${colorDiff(p.diff, c)}`);
    }
    const changes = count(plans, 'create') + count(plans, 'update');
    ctx.info();
    if (opts.dryRun) {
      ctx.info(c.dim(`Dry run: ${changes} file(s) would be written, nothing changed.`));
    } else {
      ctx.info(`${c.green('✔')} ${written.length} file(s) written, ${count(plans, 'unchanged')} unchanged.`);
    }
  }
  if (conflicts.length) {
    ctx.io.stderr(
      `${c.red('✖')} ${conflicts.length} file(s) have managed blocks edited by hand: ` +
        `${conflicts.map((p) => p.path).join(', ')}\n` +
        `  Move your edits outside the ai-rules markers, or re-run with --force to overwrite them.\n`,
    );
    return 1;
  }
  return 0;
}

function colorDiff(diff: string, c: Colors): string {
  return diff
    .split('\n')
    .map((l) =>
      l.startsWith('+') && !l.startsWith('+++')
        ? c.green(l)
        : l.startsWith('-') && !l.startsWith('---')
          ? c.red(l)
          : l.startsWith('@@')
            ? c.cyan(l)
            : l,
    )
    .join('\n')
    .replace(/\n+$/, '');
}

export function registerGenerate(program: Command, bind: Bind): void {
  program
    .command('generate')
    .description('write instruction files for the configured targets')
    .option('-t, --target <list>', 'comma-separated targets (agents,claude,cursor,copilot,gemini)')
    .option('--dry-run', 'show what would change without writing')
    .option('--diff', 'print a unified diff per file')
    .option('--force', 'overwrite managed blocks that were edited by hand')
    .option('--with-evidence', 'add <!-- from: … --> comments after each rule')
    .option('--ai', 'add inferred rules from the configured LLM (opt-in)')
    .action(bind<GenerateOptions>((ctx, opts) => runGenerate(ctx, opts)));
}
