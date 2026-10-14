import { SECTION_IDS, type ProjectFacts, type ResolvedConfig, type Rule } from '../types.js';
import { buildAiContext } from './context.js';
import { AiError } from './errors.js';
import { parseAiRules, MAX_AI_RULES } from './parse.js';
import { DEFAULT_MODELS, PROVIDERS, type ProviderId } from './providers.js';

export { AiError } from './errors.js';
export { buildAiContext, isSensitivePath, redactSecrets } from './context.js';
export { extractJson, parseAiRules, type AiRuleDraft } from './parse.js';
export {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_MODELS,
  PROVIDERS,
  anthropicProvider,
  ollamaProvider,
  openaiProvider,
  type Provider,
  type ProviderDeps,
  type ProviderId,
  type ProviderRequest,
} from './providers.js';

export interface EnhanceOptions {
  /** Injected for tests; defaults to global fetch. */
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
  /** Called when the model answer is unusable (the result is then []). */
  warn?: (message: string) => void;
}

export const AI_SYSTEM_PROMPT = [
  'You analyse a software repository and write project-specific instructions for AI coding agents.',
  'Only state conventions you can directly observe in the provided facts, file tree and sample files:',
  'naming (files, classes, functions), folder structure and layering, recurring patterns and idioms.',
  'Rules must be concise, imperative, one line each (max 160 characters).',
  'Do not give generic advice (e.g. "write clean code", "add tests"). Do not include shell commands.',
  `Return at most ${MAX_AI_RULES} rules.`,
  'Answer with JSON only, exactly in this shape:',
  '{"rules":[{"section":"<section>","text":"<rule>"}]}',
  `where <section> is one of: ${SECTION_IDS.filter((s) => s !== 'commands').join(', ')}.`,
].join('\n');

/**
 * Ask the configured LLM for extra inferred rules. Opt-in only: requires `ai:` in config.
 * Provider/network failures throw AiError; an unusable answer returns [].
 */
export async function enhanceWithAi(
  facts: ProjectFacts,
  config: ResolvedConfig,
  options: EnhanceOptions = {},
): Promise<Rule[]> {
  const ai = config.ai;
  if (!ai) {
    throw new AiError(
      'Add an `ai:` section to .ai-rules/config.yaml (provider: ollama | anthropic | openai) to use --ai.',
    );
  }
  const providerId: ProviderId = ai.provider;
  const provider = PROVIDERS[providerId];
  if (!provider) throw new AiError(`Unknown AI provider "${String(providerId)}".`);
  const model = ai.model ?? DEFAULT_MODELS[providerId];
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const env = options.env ?? process.env;

  const answer = await provider(
    { system: AI_SYSTEM_PROMPT, prompt: buildAiContext(facts), model },
    { fetch: fetchImpl, env, baseUrl: ai.baseUrl },
  );

  const drafts = parseAiRules(answer);
  if (!drafts) {
    options.warn?.(`${providerId}:${model} returned no valid JSON rules; skipping AI suggestions.`);
    return [];
  }
  return drafts.map((d, i) => ({
    id: `ai/${i + 1}`,
    section: d.section,
    text: d.text,
    scope: '',
    pack: 'ai',
    evidence: [{ file: '(ai)', note: `${providerId}:${model}` }],
    priority: 90,
    inferred: true,
  }));
}
