import { AiError } from './errors.js';

export type ProviderId = 'ollama' | 'anthropic' | 'openai';

export interface ProviderRequest {
  system: string;
  prompt: string;
  model: string;
}

export interface ProviderDeps {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  /** Overrides the provider endpoint (config `ai.baseUrl`). */
  baseUrl?: string;
  /** Request timeout, default 60 s. */
  timeoutMs?: number;
}

/** Sends one system + user prompt and returns the raw text answer. */
export type Provider = (req: ProviderRequest, deps: ProviderDeps) => Promise<string>;

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  ollama: 'llama3.1',
  anthropic: DEFAULT_ANTHROPIC_MODEL,
  openai: 'gpt-4o-mini',
};

export const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_ERROR_BODY = 500;

export const ollamaProvider: Provider = async (req, deps) => {
  const base = trimSlash(deps.baseUrl ?? 'http://localhost:11434');
  const json = await postJson(
    'ollama',
    `${base}/api/chat`,
    {},
    {
      model: req.model,
      stream: false,
      format: 'json',
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.prompt },
      ],
    },
    deps,
  );
  const content = (json as { message?: { content?: unknown } }).message?.content;
  if (typeof content !== 'string')
    throw new AiError('ollama: unexpected response shape (no message.content)');
  return content;
};

export const anthropicProvider: Provider = async (req, deps) => {
  const key = deps.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new AiError(
      'ANTHROPIC_API_KEY is not set. Export it, or use `ai.provider: ollama` for a local model.',
    );
  }
  const base = trimSlash(
    deps.baseUrl ?? deps.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
  );
  const headers: Record<string, string> = {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
  };
  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: 16000,
    system: req.system,
    messages: [{ role: 'user', content: req.prompt }],
  };
  if (req.model === DEFAULT_ANTHROPIC_MODEL) {
    // Short structured extraction: keep reasoning effort low so the call fits the timeout,
    // and let the API re-run a declined request on its recommended fallback model.
    body.output_config = { effort: 'low' };
    body.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }
  const json = (await postJson('anthropic', `${base}/v1/messages`, headers, body, deps)) as {
    content?: unknown;
    stop_reason?: unknown;
  };
  if (json.stop_reason === 'refusal')
    throw new AiError('anthropic: the model declined the request (refusal)');
  if (!Array.isArray(json.content))
    throw new AiError('anthropic: unexpected response shape (no content array)');
  return json.content
    .filter(
      (b): b is { type: 'text'; text: string } =>
        isObj(b) && b.type === 'text' && typeof b.text === 'string',
    )
    .map((b) => b.text)
    .join('');
};

export const openaiProvider: Provider = async (req, deps) => {
  const key = deps.env.OPENAI_API_KEY;
  if (!key) {
    throw new AiError(
      'OPENAI_API_KEY is not set. Export it, or use `ai.provider: ollama` for a local model.',
    );
  }
  const base = trimSlash(deps.baseUrl ?? deps.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1');
  const json = (await postJson(
    'openai',
    `${base}/chat/completions`,
    { authorization: `Bearer ${key}` },
    {
      model: req.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.prompt },
      ],
    },
    deps,
  )) as { choices?: { message?: { content?: unknown } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string')
    throw new AiError('openai: unexpected response shape (no choices[0].message.content)');
  return content;
};

export const PROVIDERS: Record<ProviderId, Provider> = {
  ollama: ollamaProvider,
  anthropic: anthropicProvider,
  openai: openaiProvider,
};

async function postJson(
  provider: ProviderId,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  deps: ProviderDeps,
): Promise<unknown> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let res: Response;
  try {
    res = await deps.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new AiError(
        `${provider}: request timed out after ${Math.round(timeoutMs / 1000)} s (${url})`,
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new AiError(`${provider}: request to ${url} failed: ${msg}`);
  }
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new AiError(
      `${provider}: HTTP ${res.status} from ${url}: ${truncate(text, MAX_ERROR_BODY)}`,
      res.status,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AiError(`${provider}: response is not JSON: ${truncate(text, MAX_ERROR_BODY)}`);
  }
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
