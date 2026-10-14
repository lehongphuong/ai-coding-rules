import { describe, expect, it } from 'vitest';
import {
  AiError,
  DEFAULT_ANTHROPIC_MODEL,
  anthropicProvider,
  ollamaProvider,
  openaiProvider,
} from '../../src/ai/index.js';

interface Call {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

function fakeFetch(response: { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: String(input),
      init: init ?? {},
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      headers,
    });
    const text = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
    return new Response(text, { status: response.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

const req = { system: 'SYS', prompt: 'PROMPT', model: 'm1' };

describe('ollama provider', () => {
  it('posts to /api/chat with stream false and json format', async () => {
    const f = fakeFetch({ body: { message: { role: 'assistant', content: '{"rules":[]}' } } });
    const out = await ollamaProvider(req, { fetch: f.impl, env: {} });
    expect(out).toBe('{"rules":[]}');
    const call = f.calls[0]!;
    expect(call.url).toBe('http://localhost:11434/api/chat');
    expect(call.init.method).toBe('POST');
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
    expect(call.body).toMatchObject({
      model: 'm1',
      stream: false,
      format: 'json',
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'PROMPT' },
      ],
    });
  });

  it('honours baseUrl and strips trailing slash', async () => {
    const f = fakeFetch({ body: { message: { content: 'x' } } });
    await ollamaProvider(req, { fetch: f.impl, env: {}, baseUrl: 'http://gpu:1234/' });
    expect(f.calls[0]!.url).toBe('http://gpu:1234/api/chat');
  });

  it('throws AiError with status and truncated body on non-2xx', async () => {
    const f = fakeFetch({ status: 404, body: `model not found ${'x'.repeat(2000)}` });
    const err = await ollamaProvider(req, { fetch: f.impl, env: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).status).toBe(404);
    expect((err as AiError).message).toContain('HTTP 404');
    expect((err as AiError).message).toContain('model not found');
    expect((err as AiError).message.length).toBeLessThan(700);
  });

  it('wraps network errors', async () => {
    const impl = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await expect(ollamaProvider(req, { fetch: impl, env: {} })).rejects.toThrow(
      /ollama: request to .* failed: fetch failed/,
    );
  });

  it('reports timeouts', async () => {
    const impl = (async () => {
      throw new DOMException('timed out', 'TimeoutError');
    }) as typeof fetch;
    await expect(ollamaProvider(req, { fetch: impl, env: {} })).rejects.toThrow(
      /timed out after 60 s/,
    );
  });
});

describe('anthropic provider', () => {
  it('requires ANTHROPIC_API_KEY', async () => {
    const f = fakeFetch({ body: {} });
    await expect(anthropicProvider(req, { fetch: f.impl, env: {} })).rejects.toThrow(
      /ANTHROPIC_API_KEY/,
    );
    expect(f.calls).toHaveLength(0);
  });

  it('calls the Messages API and joins text blocks', async () => {
    const f = fakeFetch({
      body: {
        content: [
          { type: 'thinking', thinking: '' },
          { type: 'text', text: '{"rules":' },
          { type: 'text', text: '[]}' },
        ],
        stop_reason: 'end_turn',
      },
    });
    const out = await anthropicProvider(req, {
      fetch: f.impl,
      env: { ANTHROPIC_API_KEY: 'sk-test' },
    });
    expect(out).toBe('{"rules":[]}');
    const call = f.calls[0]!;
    expect(call.url).toBe('https://api.anthropic.com/v1/messages');
    expect(call.headers['x-api-key']).toBe('sk-test');
    expect(call.headers['anthropic-version']).toBe('2023-06-01');
    expect(call.headers['content-type']).toBe('application/json');
    expect(call.body).toMatchObject({
      model: 'm1',
      system: 'SYS',
      messages: [{ role: 'user', content: 'PROMPT' }],
    });
    expect(typeof call.body.max_tokens).toBe('number');
    expect(call.body.fallbacks).toBeUndefined();
  });

  it('adds default-model extras only for the default model', async () => {
    const f = fakeFetch({ body: { content: [{ type: 'text', text: '{}' }] } });
    await anthropicProvider(
      { ...req, model: DEFAULT_ANTHROPIC_MODEL },
      { fetch: f.impl, env: { ANTHROPIC_API_KEY: 'k' } },
    );
    expect(f.calls[0]!.body.fallbacks).toBe('default');
    expect(f.calls[0]!.headers['anthropic-beta']).toMatch(/server-side-fallback/);
  });

  it('uses ANTHROPIC_BASE_URL', async () => {
    const f = fakeFetch({ body: { content: [] } });
    await anthropicProvider(req, {
      fetch: f.impl,
      env: { ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: 'https://proxy.local/' },
    });
    expect(f.calls[0]!.url).toBe('https://proxy.local/v1/messages');
  });

  it('throws on refusal and on non-2xx', async () => {
    const refusal = fakeFetch({ body: { content: [], stop_reason: 'refusal' } });
    await expect(
      anthropicProvider(req, { fetch: refusal.impl, env: { ANTHROPIC_API_KEY: 'k' } }),
    ).rejects.toThrow(/declined/);
    const bad = fakeFetch({ status: 401, body: { error: { type: 'authentication_error' } } });
    const err = await anthropicProvider(req, {
      fetch: bad.impl,
      env: { ANTHROPIC_API_KEY: 'k' },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).message).toMatch(/HTTP 401.*authentication_error/);
  });
});

describe('openai provider', () => {
  it('requires OPENAI_API_KEY', async () => {
    const f = fakeFetch({ body: {} });
    await expect(openaiProvider(req, { fetch: f.impl, env: {} })).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it('calls chat completions with json response format', async () => {
    const f = fakeFetch({
      body: { choices: [{ message: { role: 'assistant', content: '{"rules":[]}' } }] },
    });
    const out = await openaiProvider(req, { fetch: f.impl, env: { OPENAI_API_KEY: 'sk-o' } });
    expect(out).toBe('{"rules":[]}');
    const call = f.calls[0]!;
    expect(call.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(call.headers.authorization).toBe('Bearer sk-o');
    expect(call.body).toMatchObject({
      model: 'm1',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'PROMPT' },
      ],
    });
  });

  it('uses OPENAI_BASE_URL and rejects unexpected shapes', async () => {
    const f = fakeFetch({ body: { nope: true } });
    await expect(
      openaiProvider(req, {
        fetch: f.impl,
        env: { OPENAI_API_KEY: 'k', OPENAI_BASE_URL: 'http://llm:8080/v1' },
      }),
    ).rejects.toThrow(/unexpected response shape/);
    expect(f.calls[0]!.url).toBe('http://llm:8080/v1/chat/completions');
  });
});
