import * as clack from '@clack/prompts';
import { TARGET_IDS, type TargetId } from '../types.js';

export const TARGET_HINTS: Record<TargetId, string> = {
  agents: 'AGENTS.md — Codex, Cursor, Copilot, Windsurf, …',
  claude: 'CLAUDE.md — Claude Code',
  cursor: '.cursor/rules/*.mdc — Cursor',
  copilot: '.github/copilot-instructions.md — GitHub Copilot',
  gemini: 'GEMINI.md — Gemini CLI',
};

/** Interactive prompts (TTY only). Returns undefined when the user cancels. */
export const prompts = {
  async selectTargets(initial: TargetId[]): Promise<TargetId[] | undefined> {
    const result = await clack.multiselect<TargetId>({
      message: 'Which instruction files should ai-rules generate?',
      options: TARGET_IDS.map((value) => ({ value, label: value, hint: TARGET_HINTS[value] })),
      initialValues: initial,
      required: true,
    });
    return clack.isCancel(result) ? undefined : result;
  },

  async confirm(message: string, initialValue = true): Promise<boolean | undefined> {
    const result = await clack.confirm({ message, initialValue });
    return clack.isCancel(result) ? undefined : result;
  },
};
