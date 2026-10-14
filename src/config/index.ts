import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Document, isMap, isPair, isScalar, isSeq, parse } from 'yaml';
import { CONFIG_PATHS, defaultConfig } from '../core/config-defaults.js';
import type { ResolvedConfig } from '../types.js';
import { configFileSchema, formatIssues, type ConfigFile } from './schema.js';

export { CHECK_IDS, configFileSchema, type ConfigFile } from './schema.js';

export interface LoadedConfig {
  config: ResolvedConfig;
  /** Repo-relative path the config was read from, if any. */
  path?: string;
}

/** Invalid or unreadable config file. `message` is ready to print. */
export class ConfigError extends Error {
  constructor(
    message: string,
    readonly path?: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Default path `init` writes to. */
export const DEFAULT_CONFIG_PATH = CONFIG_PATHS[0]!;

/** First existing config path (repo-relative), or undefined. */
export function findConfig(root: string): string | undefined {
  return CONFIG_PATHS.find((p) => existsSync(join(root, p)));
}

/** Load + validate config from `root`; defaults when absent. Throws ConfigError on invalid. */
export function loadConfig(root: string): LoadedConfig {
  const path = findConfig(root);
  if (!path) return { config: defaultConfig() };
  let text: string;
  try {
    text = readFileSync(join(root, path), 'utf8');
  } catch (err) {
    throw new ConfigError(`${path}: cannot read file (${(err as Error).message})`, path);
  }
  return { config: parseConfig(text, path), path };
}

/** Parse + validate YAML text; `source` is used in error messages. */
export function parseConfig(text: string, source = DEFAULT_CONFIG_PATH): ResolvedConfig {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (err) {
    throw new ConfigError(
      `${source}: invalid YAML: ${(err as Error).message.split('\n')[0]!.replace(/:$/, '')}`,
      source,
    );
  }
  if (raw === null || raw === undefined) raw = {};
  const result = configFileSchema.safeParse(raw);
  if (!result.success) {
    const issues = formatIssues(result.error);
    const message =
      issues.length === 1
        ? `${source}: ${issues[0]}`
        : `${source}: invalid config\n${issues.map((i) => `  - ${i}`).join('\n')}`;
    throw new ConfigError(message, source, issues);
  }
  return mergeConfig(defaultConfig(), result.data);
}

/** Deep-merge a validated config file onto a resolved config. Arrays replace. */
export function mergeConfig(base: ResolvedConfig, file: ConfigFile): ResolvedConfig {
  return {
    targets: file.targets ? [...file.targets] : base.targets,
    claude: { ...base.claude, ...file.claude },
    output: { ...base.output, ...file.output },
    ignore: file.ignore ?? base.ignore,
    rules: {
      disable: file.rules?.disable ?? base.rules.disable,
      custom: file.rules?.custom ?? base.rules.custom,
    },
    doctor: {
      ...base.doctor,
      ...file.doctor,
      budget: { ...base.doctor.budget, ...file.doctor?.budget },
    },
    ...(file.ai || base.ai ? { ai: { ...base.ai, ...file.ai } as ResolvedConfig['ai'] } : {}),
  };
}

const KEY_COMMENTS: Record<string, string> = {
  targets: ' Files to generate: agents, claude, cursor, copilot, gemini',
  claude: ' CLAUDE.md style: import (@AGENTS.md + Claude notes) | full',
  output: ' Evidence comments after each rule: none | comment',
  ignore: ' Extra gitignore-style patterns skipped by the scanner',
  rules:
    ' disable: rule ids or pack prefixes ("common/no-secrets", "nestjs/*")\n custom: team rules { id, section, text, scope? }',
  doctor:
    ' failOn: error | warning; checks: conflict/repo, conflict/files, stale/command,\n stale/path, duplicate, budget, legacy, empty',
  ai: ' Optional LLM step (generate --ai): ollama | anthropic | openai',
};

const AI_EXAMPLE = [
  ' Optional LLM step (generate --ai), never used unless requested:',
  ' ai:',
  '   provider: ollama        # ollama | anthropic | openai',
  '   model: llama3.1',
  '   baseUrl: http://localhost:11434',
].join('\n');

/** Commented YAML for `.ai-rules/config.yaml` (missing keys filled from defaults). */
export function renderConfigYaml(config: Partial<ResolvedConfig> = {}): string {
  const merged = mergeConfig(defaultConfig(), config as ConfigFile);
  const doc = new Document(merged);
  doc.commentBefore = ' ai-coding-rules configuration. Docs: npx ai-coding-rules --help';
  const root = doc.contents;
  if (isMap(root)) {
    root.items.forEach((pair, i) => {
      if (!isPair(pair) || !isScalar(pair.key)) return;
      const comment = KEY_COMMENTS[String(pair.key.value)];
      if (comment) pair.key.commentBefore = comment;
      pair.key.spaceBefore = i > 0;
      flowStringArrays(pair.value);
    });
  }
  if (!merged.ai) doc.comment = AI_EXAMPLE;
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

/** Render short string arrays as `[a, b]` for readability. */
function flowStringArrays(node: unknown): void {
  if (isSeq(node)) {
    if (node.items.every((i) => isScalar(i))) node.flow = true;
    else node.items.forEach(flowStringArrays);
  } else if (isMap(node)) {
    for (const pair of node.items) if (isPair(pair)) flowStringArrays(pair.value);
  }
}

/** Write `.ai-rules/config.yaml` under `root`; returns the repo-relative path. */
export function writeConfig(root: string, config: Partial<ResolvedConfig> = {}): string {
  const abs = join(root, DEFAULT_CONFIG_PATH);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, renderConfigYaml(config));
  return DEFAULT_CONFIG_PATH;
}
