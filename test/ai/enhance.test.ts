import { describe, expect, it, vi } from 'vitest';
import { createMemoryFileIndex, defaultConfig } from '../../src/core/index.js';
import { AiError, enhanceWithAi, extractJson, parseAiRules } from '../../src/ai/index.js';
import type { ProjectFacts, ResolvedConfig } from '../../src/types.js';

const facts: ProjectFacts = {
  root: '/virtual',
  name: 'demo',
  files: createMemoryFileIndex({ 'src/main.ts': 'export {}\n' }),
  facts: [],
  workspaces: [{ dir: '', name: 'demo' }],
  scripts: [],
};

function config(ai?: ResolvedConfig['ai']): ResolvedConfig {
  return { ...defaultConfig(), ai };
}

function ollamaReturning(content: string) {
  return vi.fn(
    async () => new Response(JSON.stringify({ message: { content } })),
  ) as unknown as typeof fetch;
}

describe('parseAiRules', () => {
  it('parses code-fenced JSON surrounded by prose', () => {
    const text =
      'Here you go:\n```json\n{"rules":[{"section":"architecture","text":"Put feature code in `src/features/<name>/`."}]}\n```\nThanks!';
    expect(parseAiRules(text)).toEqual([
      { section: 'architecture', text: 'Put feature code in `src/features/<name>/`.' },
    ]);
  });

  it('accepts a bare array and braces inside strings', () => {
    expect(extractJson('x [{"section":"testing","text":"Use {curly} names"}] y')).toEqual([
      { section: 'testing', text: 'Use {curly} names' },
    ]);
    expect(parseAiRules('[{"section":"testing","text":"Name tests *.spec.ts"}]')).toHaveLength(1);
  });

  it('drops invalid sections, commands, empty and duplicate rules; trims long text', () => {
    const out = parseAiRules(
      JSON.stringify({
        rules: [
          { section: 'nope', text: 'x' },
          { section: 'commands', text: 'Run `npm run magic`' },
          { section: 'code-style', text: '   ' },
          { section: 'Code-Style', text: '- Use PascalCase for classes.' },
          { section: 'code-style', text: 'use pascalcase for classes.' },
          { section: 'security', text: 'a'.repeat(500) },
          { section: 'testing' },
          'garbage',
        ],
      }),
    )!;
    expect(out.map((r) => r.section)).toEqual(['code-style', 'security']);
    expect(out[0]!.text).toBe('Use PascalCase for classes.');
    expect(out[1]!.text.length).toBe(200);
    expect(out[1]!.text.endsWith('…')).toBe(true);
  });

  it('caps at 15 rules', () => {
    const rules = Array.from({ length: 30 }, (_, i) => ({
      section: 'dos-donts',
      text: `Rule ${i}`,
    }));
    expect(parseAiRules(JSON.stringify({ rules }))).toHaveLength(15);
  });

  it('returns undefined for non-JSON or wrong shape', () => {
    expect(parseAiRules('I cannot help with that.')).toBeUndefined();
    expect(parseAiRules('{"suggestions": []}')).toBeUndefined();
    expect(parseAiRules('{"rules": [')).toBeUndefined();
  });
});

describe('enhanceWithAi', () => {
  it('requires an ai section in config', async () => {
    await expect(enhanceWithAi(facts, config(), { fetch: ollamaReturning('{}') })).rejects.toThrow(
      AiError,
    );
    await expect(enhanceWithAi(facts, config(), { fetch: ollamaReturning('{}') })).rejects.toThrow(
      /`ai:` section/,
    );
  });

  it('maps model output to inferred rules', async () => {
    const fetchImpl = ollamaReturning(
      JSON.stringify({
        rules: [
          { section: 'architecture', text: 'Keep one module per feature under `src/<feature>/`.' },
          { section: 'code-style', text: 'Suffix services with `.service.ts`.' },
        ],
      }),
    );
    const rules = await enhanceWithAi(facts, config({ provider: 'ollama' }), {
      fetch: fetchImpl,
      env: {},
    });
    expect(rules).toEqual([
      {
        id: 'ai/1',
        section: 'architecture',
        text: 'Keep one module per feature under `src/<feature>/`.',
        scope: '',
        pack: 'ai',
        evidence: [{ file: '(ai)', note: 'ollama:llama3.1' }],
        priority: 90,
        inferred: true,
      },
      expect.objectContaining({ id: 'ai/2', section: 'code-style', inferred: true }),
    ]);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]! as [
      string,
      RequestInit,
    ];
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(String(init.body)) as { messages: { role: string; content: string }[] };
    expect(body.messages[0]!.content).toContain('"rules"');
    expect(body.messages[1]!.content).toContain('# Project: demo');
  });

  it('uses configured model and baseUrl', async () => {
    const fetchImpl = ollamaReturning('{"rules":[]}');
    await enhanceWithAi(
      facts,
      config({ provider: 'ollama', model: 'qwen', baseUrl: 'http://h:1' }),
      {
        fetch: fetchImpl,
      },
    );
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]! as [
      string,
      RequestInit,
    ];
    expect(url).toBe('http://h:1/api/chat');
    expect(JSON.parse(String(init.body)).model).toBe('qwen');
  });

  it('returns [] and warns on invalid output', async () => {
    const warn = vi.fn();
    const rules = await enhanceWithAi(facts, config({ provider: 'ollama' }), {
      fetch: ollamaReturning('not json at all'),
      warn,
    });
    expect(rules).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('propagates missing-key errors for hosted providers', async () => {
    await expect(
      enhanceWithAi(facts, config({ provider: 'openai' }), {
        fetch: ollamaReturning('{}'),
        env: {},
      }),
    ).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it('defaults the anthropic model', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ content: [{ type: 'text', text: '{"rules":[]}' }] })),
    ) as unknown as typeof fetch;
    await enhanceWithAi(facts, config({ provider: 'anthropic' }), {
      fetch: fetchImpl,
      env: { ANTHROPIC_API_KEY: 'k' },
    });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]! as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(init.body)).model).toBe('claude-opus-5-5');
  });
});
