import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/core/config-defaults.js';
import {
  ConfigError,
  loadConfig,
  mergeConfig,
  parseConfig,
  renderConfigYaml,
  writeConfig,
} from '../../src/config/index.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ai-rules-config-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function put(path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function errorOf(fn: () => unknown): ConfigError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    return err as ConfigError;
  }
  throw new Error('expected ConfigError');
}

describe('loadConfig', () => {
  it('returns defaults without a config file', () => {
    expect(loadConfig(root)).toEqual({ config: defaultConfig() });
  });

  it.each(['.ai-rules/config.yaml', '.ai-rules/config.yml', '.ai-rules.yaml'])(
    'reads %s',
    (path) => {
      put(path, 'targets: [cursor]\n');
      const loaded = loadConfig(root);
      expect(loaded.path).toBe(path);
      expect(loaded.config.targets).toEqual(['cursor']);
    },
  );

  it('prefers .ai-rules/config.yaml over .ai-rules.yaml', () => {
    put('.ai-rules.yaml', 'targets: [gemini]\n');
    put('.ai-rules/config.yaml', 'targets: [copilot]\n');
    expect(loadConfig(root)).toMatchObject({
      path: '.ai-rules/config.yaml',
      config: { targets: ['copilot'] },
    });
  });

  it('treats an empty file as defaults', () => {
    put('.ai-rules.yaml', '# nothing here\n');
    expect(loadConfig(root).config).toEqual(defaultConfig());
  });

  it('deep-merges nested objects onto defaults', () => {
    put(
      '.ai-rules/config.yaml',
      [
        'doctor:',
        '  failOn: warning',
        '  budget:',
        '    perFile: 500',
        'claude:',
        '  mode: full',
      ].join('\n'),
    );
    const { config } = loadConfig(root);
    expect(config.doctor).toEqual({
      disable: [],
      failOn: 'warning',
      duplicateThreshold: 0.8,
      budget: { perFile: 500, perAgent: 6000 },
    });
    expect(config.claude.mode).toBe('full');
    expect(config.targets).toEqual(['agents', 'claude']);
    expect(config.ai).toBeUndefined();
  });

  it('accepts the full SPEC example', () => {
    put(
      '.ai-rules/config.yaml',
      `targets: [agents, claude, cursor, copilot, gemini]
claude:
  mode: import
output:
  evidence: comment
ignore: ["legacy/**"]
rules:
  disable: ["common/no-secrets", "nestjs/*"]
  custom:
    - id: team/pr-size
      section: dos-donts
      text: "Keep pull requests under 400 changed lines."
      scope: ""
doctor:
  disable: ["budget"]
  failOn: error
  duplicateThreshold: 0.8
  budget: { perFile: 2000, perAgent: 6000 }
ai:
  provider: ollama
  model: llama3.1
  baseUrl: http://localhost:11434
`,
    );
    const { config } = loadConfig(root);
    expect(config.targets).toHaveLength(5);
    expect(config.output.evidence).toBe('comment');
    expect(config.rules.custom[0]).toEqual({
      id: 'team/pr-size',
      section: 'dos-donts',
      text: 'Keep pull requests under 400 changed lines.',
      scope: '',
    });
    expect(config.doctor.disable).toEqual(['budget']);
    expect(config.ai).toEqual({
      provider: 'ollama',
      model: 'llama3.1',
      baseUrl: 'http://localhost:11434',
    });
  });
});

describe('validation errors', () => {
  it('reports invalid enums with path and file', () => {
    put('.ai-rules/config.yaml', 'doctor:\n  failOn: sometimes\n');
    const err = errorOf(() => loadConfig(root));
    expect(err.message).toMatch(/^\.ai-rules\/config\.yaml: doctor\.failOn: Invalid enum value/);
    expect(err.path).toBe('.ai-rules/config.yaml');
  });

  it('rejects unknown keys at any depth', () => {
    expect(errorOf(() => parseConfig('colour: red\n')).issues).toEqual(['colour: Unknown key']);
    expect(errorOf(() => parseConfig('doctor:\n  budget:\n    total: 1\n')).issues).toEqual([
      'doctor.budget.total: Unknown key',
    ]);
  });

  it('validates targets, sections and check ids', () => {
    expect(errorOf(() => parseConfig('targets: [windsurf]\n')).issues[0]).toMatch(/^targets\.0: /);
    expect(errorOf(() => parseConfig('targets: []\n')).issues[0]).toMatch(/^targets: /);
    expect(errorOf(() => parseConfig('doctor:\n  disable: [nope]\n')).issues[0]).toMatch(
      /^doctor\.disable\.0: /,
    );
    expect(errorOf(() => parseConfig('doctor:\n  duplicateThreshold: 2\n')).issues[0]).toMatch(
      /^doctor\.duplicateThreshold: /,
    );
  });

  it('validates custom rules', () => {
    const missing = errorOf(() =>
      parseConfig('rules:\n  custom:\n    - id: team/a\n      section: dos-donts\n'),
    );
    expect(missing.issues).toEqual(['rules.custom.0.text: Required']);
    const badSection = errorOf(() =>
      parseConfig('rules:\n  custom:\n    - { id: team/a, section: misc, text: Hi }\n'),
    );
    expect(badSection.issues[0]).toMatch(/^rules\.custom\.0\.section: Invalid enum value/);
    const dup = errorOf(() =>
      parseConfig(
        'rules:\n  custom:\n    - { id: team/a, section: security, text: A }\n    - { id: team/a, section: security, text: B }\n',
      ),
    );
    expect(dup.issues).toEqual(['rules.custom.1.id: Duplicate custom rule id "team/a"']);
  });

  it('lists every issue when there are several', () => {
    const err = errorOf(() => parseConfig('targets: [x]\nfoo: 1\n', '.ai-rules.yaml'));
    expect(err.message.split('\n')).toEqual([
      '.ai-rules.yaml: invalid config',
      expect.stringMatching(/^ {2}- targets\.0: /),
      '  - foo: Unknown key',
    ]);
  });

  it('reports YAML syntax errors and non-object roots', () => {
    expect(errorOf(() => parseConfig('targets: [agents\n')).message).toMatch(
      /^\.ai-rules\/config\.yaml: invalid YAML: /,
    );
    expect(errorOf(() => parseConfig('- agents\n')).issues[0]).toMatch(
      /^\(root\): Expected object/,
    );
  });
});

describe('mergeConfig', () => {
  it('replaces arrays instead of concatenating', () => {
    const base = { ...defaultConfig(), ignore: ['a'] };
    expect(mergeConfig(base, { ignore: ['b'] }).ignore).toEqual(['b']);
    expect(mergeConfig(base, {}).ignore).toEqual(['a']);
  });
});

describe('renderConfigYaml / writeConfig', () => {
  it('renders commented YAML that round-trips through loadConfig', () => {
    const partial = {
      targets: ['agents', 'cursor'] as const,
      rules: {
        disable: ['nestjs/*'],
        custom: [{ id: 'team/x', section: 'security' as const, text: 'No PII in logs.' }],
      },
      ai: { provider: 'anthropic' as const, model: 'claude-x' },
    };
    const yaml = renderConfigYaml({ ...partial, targets: [...partial.targets] });
    expect(yaml).toContain('# Files to generate');
    expect(yaml).toContain('targets: [agents, cursor]');
    const path = writeConfig(root, { ...partial, targets: [...partial.targets] });
    expect(path).toBe('.ai-rules/config.yaml');
    expect(readFileSync(join(root, path), 'utf8')).toBe(yaml);
    const { config } = loadConfig(root);
    expect(config).toEqual({
      ...defaultConfig(),
      targets: ['agents', 'cursor'],
      rules: partial.rules,
      ai: partial.ai,
    });
  });

  it('renders defaults with a commented-out ai example', () => {
    const yaml = renderConfigYaml();
    expect(yaml).toContain('# ai:');
    expect(parseConfig(yaml)).toEqual(defaultConfig());
  });
});
