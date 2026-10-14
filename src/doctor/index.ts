import type { FileIndex, Finding, InstructionDoc, ProjectFacts, ResolvedConfig } from '../types.js';

/** Parse every known instruction file in the index. (T4 — stub) */
export function parseInstructionFiles(_files: FileIndex): InstructionDoc[] {
  throw new Error('parseInstructionFiles: not implemented');
}

/** Run all enabled checks; findings sorted by file, line. (T4 — stub) */
export function runDoctor(_facts: ProjectFacts, _config: ResolvedConfig): Finding[] {
  throw new Error('runDoctor: not implemented');
}
