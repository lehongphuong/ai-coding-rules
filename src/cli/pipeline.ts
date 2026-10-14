import { enhanceWithAi } from '../ai/index.js';
import { loadConfig } from '../config/index.js';
import { renderTargets } from '../renderers/index.js';
import { buildRuleSet } from '../rules/index.js';
import { scan } from '../scanner/index.js';
import { planWrites } from '../writer/index.js';
import {
  TARGET_IDS,
  type ProjectFacts,
  type RenderedFile,
  type ResolvedConfig,
  type RuleSet,
  type TargetId,
  type WritePlan,
} from '../types.js';
import { CliError } from './context.js';

/** Config + scan result for one repo. */
export interface Project {
  root: string;
  config: ResolvedConfig;
  /** Repo-relative config path, if a file was found. */
  configPath?: string;
  facts: ProjectFacts;
}

export interface GenerationOptions {
  /** Overrides config.targets. */
  targets?: TargetId[];
  force?: boolean;
  /** Force evidence comments (otherwise config.output.evidence). */
  withEvidence?: boolean;
  /** Run the optional LLM step. */
  ai?: boolean;
  env?: Record<string, string | undefined>;
  /** Called with a message when the AI step fails (generation continues). */
  warn?: (message: string) => void;
  /** Reuse an already built rule set (skips rule building and the AI step). */
  ruleSet?: RuleSet;
}

export interface Generation extends Project {
  ruleSet: RuleSet;
  targets: TargetId[];
  files: RenderedFile[];
  plans: WritePlan[];
}

export function loadProject(root: string): Project {
  const { config, path } = loadConfig(root);
  const facts = scan(root, { ignore: config.ignore });
  return { root, config, configPath: path, facts };
}

export function buildRules(project: Project): RuleSet {
  return buildRuleSet(project.facts, project.config);
}

/** Parse `--target a,b`; throws CliError on unknown ids. */
export function parseTargets(value: string | undefined): TargetId[] | undefined {
  if (value === undefined) return undefined;
  const ids = value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (ids.length === 0) throw new CliError('--target: expected a comma-separated list of targets');
  const unknown = ids.filter((id) => !(TARGET_IDS as readonly string[]).includes(id));
  if (unknown.length) {
    throw new CliError(
      `unknown target${unknown.length > 1 ? 's' : ''} ${unknown.map((u) => `"${u}"`).join(', ')} ` +
        `(expected: ${TARGET_IDS.join(', ')})`,
    );
  }
  return [...new Set(ids)] as TargetId[];
}

/** CLAUDE.md in import mode is `@AGENTS.md`, so the agents target must be rendered too. */
export function withImportedTargets(targets: TargetId[], config: ResolvedConfig): TargetId[] {
  if (
    targets.includes('claude') &&
    config.claude.mode === 'import' &&
    !targets.includes('agents')
  ) {
    return ['agents', ...targets];
  }
  return targets;
}

/** rule set → (optional AI rules) → rendered files → write plans. Never writes. */
export async function planGeneration(
  project: Project,
  options: GenerationOptions = {},
): Promise<Generation> {
  const { config, facts, root } = project;
  const ruleSet = options.ruleSet ?? buildRules(project);
  if (options.ai && !options.ruleSet) {
    try {
      const extra = await enhanceWithAi(facts, config, { env: options.env, warn: options.warn });
      ruleSet.rules = [...ruleSet.rules, ...extra];
    } catch (err) {
      options.warn?.(
        `AI step failed, continuing without inferred rules: ${(err as Error).message}`,
      );
    }
  }
  const targets = withImportedTargets(options.targets ?? config.targets, config);
  const files = renderTargets(ruleSet, targets, {
    claudeMode: config.claude.mode,
    evidence: options.withEvidence ? 'comment' : config.output.evidence,
  });
  const plans = planWrites(root, files, { force: options.force });
  return { ...project, ruleSet, targets, files, plans };
}
