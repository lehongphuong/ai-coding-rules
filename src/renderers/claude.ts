import type { ManagedBlock, Renderer, Rule } from '../types.js';
import { renderSectionFiles } from './agents.js';
import { groupByScope, renderHeader, scopedPath } from './shared.js';

/** Claude-specific notes; command-related bullets only when commands exist. */
export function claudeNotes(rules: readonly Rule[]): ManagedBlock {
  const commands = rules.filter((r) => r.section === 'commands');
  const bullets: string[] = [];
  if (commands.some((r) => /\btest/i.test(r.text) || /test/i.test(r.id))) {
    bullets.push('Run the test command from AGENTS.md after changes and fix failures before finishing.');
  } else if (commands.length > 0) {
    bullets.push('Use the commands listed in AGENTS.md verbatim; do not invent new ones.');
  }
  bullets.push('Prefer editing existing files over creating new ones.');
  bullets.push('Keep `/memory` notes short; shared project rules belong in AGENTS.md.');
  return { id: 'claude', content: ['## Claude Code notes', ...bullets.map((b) => `- ${b}`)].join('\n') };
}

export const claudeRenderer: Renderer = {
  target: 'claude',
  render(ruleSet, options) {
    if (options.claudeMode === 'full') return renderSectionFiles('claude', 'CLAUDE.md', ruleSet, options);
    // Import mode: Claude resolves `@AGENTS.md` relative to the importing file.
    return groupByScope(ruleSet).map((scope) => ({
      path: scopedPath(scope.dir, 'CLAUDE.md'),
      target: 'claude',
      header: renderHeader(scope.name),
      blocks: [{ id: 'imports', content: '@AGENTS.md' }, claudeNotes(scope.rules)],
    }));
  },
};
