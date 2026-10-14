import type { Command } from 'commander';
import { runDoctor } from '../../doctor/index.js';
import type { WritePlan } from '../../types.js';
import type { Bind, Ctx } from '../context.js';
import { loadProject, planGeneration } from '../pipeline.js';
import { failed, type ReportFinding } from '../reporters/summary.js';
import { formatOption, report, resolveFormat, type DoctorOptions } from './doctor.js';

export const GENERATE_HINT = 'run "ai-rules generate"';

/** One `outdated` error finding per generated file that is not up to date. */
export function outdatedFindings(plans: readonly WritePlan[]): ReportFinding[] {
  return plans
    .filter((p) => p.status !== 'unchanged')
    .map((p) => ({
      checkId: 'outdated',
      severity: 'error' as const,
      file: p.path,
      message:
        p.status === 'create'
          ? 'generated file is missing'
          : p.status === 'update'
            ? 'generated file is out of date'
            : `managed blocks were edited by hand (${p.conflicts.join(', ')})`,
      hint:
        p.status === 'conflict'
          ? 'move edits outside the ai-rules markers, or run "ai-rules generate --force"'
          : GENERATE_HINT,
    }));
}

export async function runCheck(ctx: Ctx, opts: DoctorOptions): Promise<number> {
  const project = loadProject(ctx.cwd);
  const doctorFindings = runDoctor(project.facts, project.config);
  const { plans } = await planGeneration(project);
  const outdated = outdatedFindings(plans);
  const failOn = opts.strict ? 'warning' : project.config.doctor.failOn;
  const isFailed = failed(doctorFindings, failOn) || outdated.length > 0;
  const format = resolveFormat(ctx, opts);
  report(ctx, format, [...doctorFindings, ...outdated], {
    outOfDate: outdated.map((f) => ({ path: f.file, status: plans.find((p) => p.path === f.file)?.status })),
    failed: isFailed,
  });
  if (format === 'human') {
    if (outdated.length) {
      ctx.io.stderr(
        `\n${ctx.c.red('✖')} ${outdated.length} generated file(s) out of date: ` +
          `${outdated.map((f) => f.file).join(', ')}\n  ${GENERATE_HINT} and commit the result.\n`,
      );
    } else {
      ctx.info(`${ctx.c.green('✔')} generated files are up to date (${plans.length} checked)`);
    }
  }
  return isFailed ? 1 : 0;
}

export function registerCheck(program: Command, bind: Bind): void {
  program
    .command('check')
    .description('CI gate: doctor + verify generated files are up to date (writes nothing)')
    .addOption(formatOption())
    .option('--strict', 'fail on warnings too')
    .action(bind(runCheck));
}
