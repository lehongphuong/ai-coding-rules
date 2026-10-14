import type { RenderedFile, Renderer } from '../types.js';
import { groupByScope, renderHeader, scopeSlug, sectionBlocks } from './shared.js';

/** Copilot: repo-wide instructions for root, path-specific files per scope. */
export const copilotRenderer: Renderer = {
  target: 'copilot',
  render(ruleSet, options) {
    return groupByScope(ruleSet).map((scope): RenderedFile => {
      const blocks = sectionBlocks(scope.rules, options);
      if (scope.dir === '') {
        return {
          path: '.github/copilot-instructions.md',
          target: 'copilot',
          header: renderHeader(scope.name, scope.description),
          blocks,
        };
      }
      return {
        path: `.github/instructions/${scopeSlug(scope.dir)}.instructions.md`,
        target: 'copilot',
        // JSON strings are valid YAML double-quoted scalars.
        frontMatter: `applyTo: ${JSON.stringify(`${scope.dir}/**`)}`,
        header: renderHeader(scope.name, scope.description),
        blocks,
      };
    });
  },
};
