import type { RenderedFile, Renderer, RenderOptions, RuleSet, TargetId } from '../types.js';

/** Renderer for one target. (T3 — stub) */
export function getRenderer(_target: TargetId): Renderer {
  throw new Error('getRenderer: not implemented');
}

/** Render every requested target, deterministic order. (T3 — stub) */
export function renderTargets(
  _ruleSet: RuleSet,
  _targets: readonly TargetId[],
  _options: RenderOptions,
): RenderedFile[] {
  throw new Error('renderTargets: not implemented');
}
