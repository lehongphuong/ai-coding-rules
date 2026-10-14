/**
 * Shared types: the contract between scanner, rule engine, renderers, writer,
 * doctor, config and CLI. See SPEC.md for the behaviour behind each type.
 */

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** Read-only view of the repository. All paths are POSIX, relative to root. */
export interface FileIndex {
  readonly root: string;
  /** Every indexed file path (not directories), sorted. */
  readonly paths: readonly string[];
  has(path: string): boolean;
  /** True if any indexed file lives under `dir` (dir may end with or without "/"). */
  hasDir(dir: string): boolean;
  /** File content, or undefined if missing / too large / binary. Cached. */
  read(path: string): string | undefined;
  /** Parsed JSON, or undefined if missing or invalid. Never throws. */
  readJson<T = unknown>(path: string): T | undefined;
  /** Paths matching a simple glob (`*`, `**`, `?`), relative to root. */
  glob(pattern: string): string[];
  /** Direct children (files and dirs) of a directory, names only. */
  list(dir: string): string[];
}

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

export interface Evidence {
  /** Repo-relative POSIX path, or a pseudo source like "(config)" / "(ai)". */
  file: string;
  /** Locator inside the file, e.g. "#scripts.test" or "#dependencies.@nestjs/core". */
  pointer?: string;
  /** 1-based line number when known. */
  line?: number;
  note?: string;
}

export type FactKey =
  | 'language'
  | 'framework'
  | 'packageManager'
  | 'testRunner'
  | 'linter'
  | 'formatter'
  | 'typescriptStrict'
  | 'command'
  | 'orm'
  | 'stateManagement'
  | 'styling'
  | 'ci'
  | 'monorepo'
  | 'runtime'
  | 'indent'
  | 'agentFile';

export type FactValue = string | number | boolean;

export type CommandKind =
  | 'install'
  | 'dev'
  | 'build'
  | 'test'
  | 'lint'
  | 'format'
  | 'typecheck'
  | 'e2e'
  | 'migrate'
  | 'codegen';

export interface Fact {
  key: FactKey;
  value: FactValue;
  /** 0..1. >= 0.9 means direct evidence (lockfile, dependency, config file). */
  confidence: number;
  evidence: Evidence[];
  /** Workspace dir; "" = repo root. */
  scope: string;
  /** Extra data, e.g. { version: "10.2.0" } or { kind: "test", name: "test" } for commands. */
  meta?: Record<string, string>;
}

export interface Workspace {
  /** "" for the root workspace. */
  dir: string;
  name: string;
  /** Manifest that defines the workspace, e.g. "apps/api/package.json". */
  manifest?: string;
}

export type ScriptSource = 'npm' | 'composer' | 'make' | 'just' | 'melos';

/** A named, invokable command defined by the project (used for stale checks). */
export interface ScriptDef {
  source: ScriptSource;
  name: string;
  scope: string;
  evidence: Evidence;
}

export interface ProjectFacts {
  root: string;
  name: string;
  description?: string;
  files: FileIndex;
  facts: Fact[];
  /** Root workspace ({ dir: "" }) is always first. */
  workspaces: Workspace[];
  scripts: ScriptDef[];
}

export interface DetectContext {
  files: FileIndex;
  /** Workspace dir being scanned ("" = root). Detectors must prefix paths with it. */
  dir: string;
}

export interface Detector {
  id: string;
  detect(ctx: DetectContext): Fact[];
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export const SECTION_IDS = [
  'overview',
  'commands',
  'code-style',
  'architecture',
  'testing',
  'dos-donts',
  'security',
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_TITLES: Record<SectionId, string> = {
  overview: 'Project overview',
  commands: 'Commands',
  'code-style': 'Code style',
  architecture: 'Architecture',
  testing: 'Testing',
  'dos-donts': 'Do and don’t',
  security: 'Security',
};

export interface Rule {
  /** Globally unique, "<pack>/<name>", e.g. "nestjs/modules". */
  id: string;
  section: SectionId;
  /** Markdown, one line, imperative. */
  text: string;
  scope: string;
  pack: string;
  evidence: Evidence[];
  /** Lower = earlier within a section. Default 50. */
  priority: number;
  /** True when produced by the optional AI step (no hard evidence). */
  inferred?: boolean;
}

export interface ScopeInfo {
  dir: string;
  name: string;
  /** Short stack summary, e.g. "NestJS · TypeScript · pnpm". */
  summary: string;
}

export interface RuleSet {
  project: { name: string; description?: string };
  rules: Rule[];
  /** Root first, then workspaces that have at least one rule. */
  scopes: ScopeInfo[];
}

// ---------------------------------------------------------------------------
// Rendering & writing
// ---------------------------------------------------------------------------

export const TARGET_IDS = ['agents', 'claude', 'cursor', 'copilot', 'gemini'] as const;
export type TargetId = (typeof TARGET_IDS)[number];

export interface ManagedBlock {
  /** Unique within the file, e.g. "commands". */
  id: string;
  /** Markdown body (without markers), no trailing newline required. */
  content: string;
}

export interface RenderedFile {
  /** Repo-relative POSIX path. */
  path: string;
  target: TargetId;
  /** YAML front matter body (without the --- fences), regenerated every time. */
  frontMatter?: string;
  /** Unmanaged text written only when the file is created (e.g. "# Project"). */
  header?: string;
  blocks: ManagedBlock[];
}

export interface RenderOptions {
  claudeMode: 'import' | 'full';
  evidence: 'none' | 'comment';
}

export interface Renderer {
  target: TargetId;
  render(ruleSet: RuleSet, options: RenderOptions): RenderedFile[];
}

export type WriteStatus = 'create' | 'update' | 'unchanged' | 'conflict';

export interface WritePlan {
  path: string;
  target: TargetId;
  status: WriteStatus;
  /** Final content to write (for conflict: what would be written with --force). */
  content: string;
  /** Unified diff from existing to content ('' when unchanged). */
  diff: string;
  /** Block ids that were hand-edited (status conflict). */
  conflicts: string[];
}

// ---------------------------------------------------------------------------
// Doctor
// ---------------------------------------------------------------------------

export type Severity = 'error' | 'warning' | 'info';

export type CheckId =
  | 'conflict/repo'
  | 'conflict/files'
  | 'stale/command'
  | 'stale/path'
  | 'duplicate'
  | 'budget'
  | 'legacy'
  | 'empty';

export interface Location {
  file: string;
  line?: number;
  endLine?: number;
}

export interface Finding extends Location {
  checkId: CheckId;
  severity: Severity;
  message: string;
  related?: Location[];
  hint?: string;
}

export type AgentId = 'claude' | 'codex' | 'cursor' | 'copilot' | 'gemini' | 'windsurf';

export interface InstructionSection {
  heading: string;
  /** 1 for "#", 2 for "##"... 0 for content before the first heading. */
  level: number;
  /** 1-based inclusive line range (heading line included). */
  startLine: number;
  endLine: number;
  /** True if the section lies inside an ai-rules managed block. */
  generated: boolean;
}

export interface InstructionDoc {
  path: string;
  /** Which agents load this file. */
  agents: AgentId[];
  frontMatter?: Record<string, unknown>;
  /** File lines without the front matter offset applied: lines[0] is line 1 of the file. */
  lines: string[];
  sections: InstructionSection[];
  /** Line numbers (1-based) that are inside fenced code blocks. */
  codeLines: Set<number>;
  /** Paths imported with "@path" (Claude import syntax), resolved repo-relative. */
  imports: string[];
  text: string;
}

export interface Claim {
  key:
    | 'packageManager'
    | 'testRunner'
    | 'formatter'
    | 'linter'
    | 'indent'
    | 'quotes'
    | 'semicolons'
    | 'language'
    | 'command'
    | 'path';
  value: string;
  negated: boolean;
  file: string;
  line: number;
  /** The source line, trimmed. */
  text: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface CustomRuleConfig {
  id: string;
  section: SectionId;
  text: string;
  scope?: string;
}

export interface ResolvedConfig {
  targets: TargetId[];
  claude: { mode: 'import' | 'full' };
  output: { evidence: 'none' | 'comment' };
  ignore: string[];
  rules: { disable: string[]; custom: CustomRuleConfig[] };
  doctor: {
    disable: CheckId[];
    failOn: 'error' | 'warning';
    duplicateThreshold: number;
    budget: { perFile: number; perAgent: number };
  };
  ai?: { provider: 'ollama' | 'anthropic' | 'openai'; model?: string; baseUrl?: string };
}
