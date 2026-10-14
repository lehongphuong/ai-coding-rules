import type { RenderedFile, Renderer, RenderOptions, RuleSet, TargetId } from '../types.js';
import { groupByScope, renderHeader, scopedPath, sectionBlocks } from './shared.js';

/** AGENTS.md-style layout: one file per scope, `# name` header, a block per section. */
export function renderSectionFiles(
  target: TargetId,
  fileName: string,
  ruleSet: RuleSet,
  options: RenderOptions,
): RenderedFile[] {
  return groupByScope(ruleSet).map((scope) => ({
    path: scopedPath(scope.dir, fileName),
    target,
    header: renderHeader(scope.name, scope.description),
    blocks: sectionBlocks(scope.rules, options),
  }));
}

export const agentsRenderer: Renderer = {
  target: 'agents',
  render: (ruleSet, options) => renderSectionFiles('agents', 'AGENTS.md', ruleSet, options),
};
