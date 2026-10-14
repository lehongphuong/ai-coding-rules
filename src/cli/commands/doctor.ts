import { Option, type Command } from 'commander';
import { runDoctor } from '../../doctor/index.js';
import { packageVersion, type Bind, type Ctx } from '../context.js';
import { loadProject } from '../pipeline.js';
import { renderHuman } from '../reporters/human.js';
import { renderJson } from '../reporters/json.js';
import { renderSarif } from '../reporters/sarif.js';
import { failed, type ReportFinding } from '../reporters/summary.js';

export type ReportFormat = 'human' | 'json' | 'sarif';

export interface DoctorOptions {
  format?: ReportFormat;
  strict?: boolean;
}

export function resolveFormat(ctx: Ctx, opts: DoctorOptions): ReportFormat {
  return ctx.json ? 'json' : (opts.format ?? 'human');
}

/** Print findings in the requested format. `extra` is merged into the JSON payload. */
export function report(
  ctx: Ctx,
  format: ReportFormat,
  findings: readonly ReportFinding[],
  extra: Record<string, unknown> = {},
): void {
  if (format === 'json') ctx.print(renderJson(findings, extra));
  else if (format === 'sarif') ctx.print(renderSarif(findings, packageVersion()));
  else ctx.print(renderHuman(ctx.quiet ? findings.filter((f) => f.severity !== 'info') : findings, ctx.c));
}

export function runDoctorCommand(ctx: Ctx, opts: DoctorOptions): number {
  const project = loadProject(ctx.cwd);
  const findings = runDoctor(project.facts, project.config);
  const failOn = opts.strict ? 'warning' : project.config.doctor.failOn;
  const isFailed = failed(findings, failOn);
  report(ctx, resolveFormat(ctx, opts), findings, { failed: isFailed });
  return isFailed ? 1 : 0;
}

export function formatOption(): Option {
  return new Option('-f, --format <format>', 'output format').choices(['human', 'json', 'sarif']).default('human');
}

export function registerDoctor(program: Command, bind: Bind): void {
  program
    .command('doctor')
    .description('lint existing instruction files for conflicts, stale references, duplicates and size')
    .addOption(formatOption())
    .option('--strict', 'fail on warnings too')
    .action(bind(runDoctorCommand));
}
