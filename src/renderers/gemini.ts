import type { Renderer } from '../types.js';
import { renderSectionFiles } from './agents.js';

/** GEMINI.md: same layout as AGENTS.md. */
export const geminiRenderer: Renderer = {
  target: 'gemini',
  render: (ruleSet, options) => renderSectionFiles('gemini', 'GEMINI.md', ruleSet, options),
};
