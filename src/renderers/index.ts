import type { RenderedFile, Renderer, RenderOptions, RuleSet, TargetId } from '../types.js';
import { agentsRenderer } from './agents.js';
import { claudeRenderer } from './claude.js';
import { copilotRenderer } from './copilot.js';
import { cursorRenderer } from './cursor.js';
import { geminiRenderer } from './gemini.js';

export { scopeSlug, scopedPath, renderSectionBody, renderRuleLine, evidenceComment } from './shared.js';

export const RENDERERS: Record<TargetId, Renderer> = {
  agents: agentsRenderer,
  claude: claudeRenderer,
  cursor: cursorRenderer,
  copilot: copilotRenderer,
  gemini: geminiRenderer,
};

/** Renderer for one target. */
export function getRenderer(target: TargetId): Renderer {
  const renderer = RENDERERS[target];
  if (!renderer) throw new Error(`Unknown target: ${String(target)}`);
  return renderer;
}

/** Render every requested target (de-duplicated, given order); files sorted by path per target. */
export function renderTargets(
  ruleSet: RuleSet,
  targets: readonly TargetId[],
  options: RenderOptions,
): RenderedFile[] {
  const out: RenderedFile[] = [];
  for (const target of new Set(targets)) {
    const files = getRenderer(target).render(ruleSet, options);
    out.push(...files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)));
  }
  return out;
}
