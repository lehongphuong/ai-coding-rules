import type { Command } from 'commander';
import { writeConfig } from '../../config/index.js';
import { defaultConfig } from '../../core/config-defaults.js';
import { TARGET_IDS, type FactKey, type ProjectFacts, type TargetId } from '../../types.js';
import type { Bind, Ctx } from '../context.js';
import { columns, scopeLabel } from '../format.js';
import { loadProject, parseTargets } from '../pipeline.js';
import { prompts } from '../prompts.js';
import { runGenerate } from './generate.js';

export interface InitOptions {
  yes?: boolean;
  target?: string;
  ai?: boolean;
  dryRun?: boolean;
}

/** Targets whose instruction files already exist in the repo. */
export function detectTargets(facts: ProjectFacts): TargetId[] {
  const found = new Set<TargetId>();
  const isTarget = (t: unknown): t is TargetId => (TARGET_IDS as readonly unknown[]).includes(t);
  for (const f of facts.facts) {
    if (f.key !== 'agentFile') continue;
    const target = f.meta?.target;
    if (isTarget(target)) found.add(target);
    const path = String(f.value);
    if (/(^|\/)AGENTS\.md$/.test(path)) found.add('agents');
    if (/(^|\/)CLAUDE(\.local)?\.md$/.test(path)) found.add('claude');
    if (path.startsWith('.cursor') || path === '.cursorrules') found.add('cursor');
    if (
      path.startsWith('.github/copilot-instructions') ||
      path.startsWith('.github/instructions/')
    ) {
      found.add('copilot');
    }
    if (/(^|\/)GEMINI\.md$/.test(path)) found.add('gemini');
  }
  if (facts.files.hasDir('.cursor') || facts.files.has('.cursorrules')) found.add('cursor');
  if (facts.files.has('.github/copilot-instructions.md')) found.add('copilot');
  if (facts.files.has('GEMINI.md')) found.add('gemini');
  return TARGET_IDS.filter((t) => found.has(t));
}

/** Default selection: config defaults + agents the repo already uses. */
export function defaultTargets(facts: ProjectFacts): TargetId[] {
  const set = new Set<TargetId>([...defaultConfig().targets, ...detectTargets(facts)]);
  return TARGET_IDS.filter((t) => set.has(t));
}

const SUMMARY_KEYS: FactKey[] = ['framework', 'language', 'packageManager'];

/** One line per scope: "root  nestjs · typescript · pnpm". */
export function stackSummary(facts: ProjectFacts): string[] {
  const rows: string[][] = [];
  for (const ws of facts.workspaces) {
    const values = SUMMARY_KEYS.flatMap((key) =>
      facts.facts.filter((f) => f.scope === ws.dir && f.key === key).map((f) => String(f.value)),
    );
    if (values.length || ws.dir === '')
      rows.push([`  ${scopeLabel(ws.dir)}`, values.join(' · ') || '(nothing detected)']);
  }
  return columns(rows);
}

export async function runInit(ctx: Ctx, opts: InitOptions): Promise<number> {
  const { c } = ctx;
  const interactive = ctx.interactive && !opts.yes;
  const project = loadProject(ctx.cwd);

  ctx.info(`${c.bold('ai-rules')} detected ${c.bold(project.facts.name)}`);
  ctx.info(stackSummary(project.facts).join('\n'));
  ctx.info();

  let targets = parseTargets(opts.target);
  if (!targets && project.configPath) {
    targets = project.config.targets;
    ctx.info(c.dim(`Using targets from ${project.configPath}: ${targets.join(', ')}`));
  }
  if (!targets) {
    const initial = defaultTargets(project.facts);
    targets = interactive ? await prompts.selectTargets(initial) : initial;
    if (!targets) return cancelled(ctx);
  }

  if (interactive) {
    const ok = await prompts.confirm(`Generate instruction files for ${targets.join(', ')}?`);
    if (!ok) return cancelled(ctx);
  }

  let configPath = project.configPath;
  if (!configPath && !opts.dryRun) {
    configPath = writeConfig(ctx.cwd, { targets });
    ctx.info(`${c.green('✔')} created ${configPath}`);
  }

  const code = await runGenerate(
    ctx,
    { ai: opts.ai, dryRun: opts.dryRun },
    {
      project: { ...project, configPath, config: { ...project.config, targets } },
      confirmForce: interactive
        ? async (conflicts) =>
            (await prompts.confirm(
              `${conflicts.map((p) => p.path).join(', ')} contain hand-edited managed blocks. Overwrite them?`,
              false,
            )) === true
        : undefined,
    },
  );

  ctx.info();
  ctx.info(c.bold('Next steps'));
  ctx.info(`  • review and commit the generated files${configPath ? ` and ${configPath}` : ''}`);
  ctx.info(`  • run ${c.cyan('ai-rules doctor')} to lint all instruction files`);
  ctx.info(`  • add ${c.cyan('npx ai-coding-rules check')} to CI to keep them up to date`);
  return code;
}

function cancelled(ctx: Ctx): number {
  ctx.io.stderr('Cancelled — nothing was written.\n');
  return 0;
}

export function registerInit(program: Command, bind: Bind): void {
  program
    .command('init')
    .description('scan the repo, create .ai-rules/config.yaml and generate instruction files')
    .option('-y, --yes', 'accept defaults without prompting')
    .option('-t, --target <list>', 'comma-separated targets (skips the selection prompt)')
    .option('--ai', 'add inferred rules from the configured LLM (opt-in)')
    .option('--dry-run', 'show what would be generated without writing anything')
    .action(bind(runInit));
}
