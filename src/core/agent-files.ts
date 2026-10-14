import type { AgentId } from '../types.js';
import { matchGlob } from './glob.js';

export interface AgentFilePattern {
  /** Glob relative to repo root. */
  glob: string;
  agents: AgentId[];
  legacy?: { replacement: string };
}

/** Every instruction file the doctor knows about (SPEC §6.1). */
export const AGENT_FILE_PATTERNS: AgentFilePattern[] = [
  { glob: '**/AGENTS.md', agents: ['codex', 'cursor', 'copilot', 'windsurf'] },
  { glob: '**/CLAUDE.md', agents: ['claude'] },
  { glob: '**/CLAUDE.local.md', agents: ['claude'] },
  { glob: '**/.claude/CLAUDE.md', agents: ['claude'] },
  { glob: '.cursorrules', agents: ['cursor'], legacy: { replacement: '.cursor/rules/*.mdc' } },
  { glob: '.cursor/rules/**/*.mdc', agents: ['cursor'] },
  { glob: '.github/copilot-instructions.md', agents: ['copilot'] },
  { glob: '.github/instructions/**/*.instructions.md', agents: ['copilot'] },
  { glob: '**/GEMINI.md', agents: ['gemini'] },
  { glob: '.windsurfrules', agents: ['windsurf'], legacy: { replacement: '.windsurf/rules/*.md' } },
  { glob: '.windsurf/rules/**/*.md', agents: ['windsurf'] },
];

/** Agents that load `path`, or [] if it's not an instruction file. */
export function agentsForFile(path: string): AgentId[] {
  const out = new Set<AgentId>();
  for (const p of AGENT_FILE_PATTERNS) {
    if (matchGlob(path, p.glob)) p.agents.forEach((a) => out.add(a));
  }
  return [...out];
}

export function isInstructionFile(path: string): boolean {
  return agentsForFile(path).length > 0;
}

export function legacyReplacement(path: string): string | undefined {
  return AGENT_FILE_PATTERNS.find((p) => p.legacy && matchGlob(path, p.glob))?.legacy?.replacement;
}
