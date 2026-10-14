import { stringify } from 'yaml';
import type { RenderedFile, Renderer, SectionId } from '../types.js';
import { groupByScope, groupBySection, renderSectionBody, scopeSlug } from './shared.js';

/** Root sections that Cursor should always load. */
const ALWAYS_APPLY: ReadonlySet<SectionId> = new Set(['overview', 'commands', 'code-style']);

/** Cursor project rules: one `.mdc` per (scope, section). */
export const cursorRenderer: Renderer = {
  target: 'cursor',
  render(ruleSet, options) {
    const files: RenderedFile[] = [];
    for (const scope of groupByScope(ruleSet)) {
      for (const section of groupBySection(scope.rules)) {
        const fm: Record<string, string | boolean> = { description: `${section.title} for ${scope.name}` };
        if (scope.dir !== '') fm.globs = `${scope.dir}/**`;
        fm.alwaysApply = scope.dir === '' && ALWAYS_APPLY.has(section.id);
        files.push({
          path: `.cursor/rules/${scopeSlug(scope.dir)}-${section.id}.mdc`,
          target: 'cursor',
          frontMatter: stringify(fm, { lineWidth: 0 }).trimEnd(),
          blocks: [{ id: section.id, content: renderSectionBody(section.title, section.rules, options) }],
        });
      }
    }
    return files;
  },
};
