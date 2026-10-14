import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/scanner/index.js', () => ({ scan: vi.fn(), scanFiles: vi.fn() }));
vi.mock('../../src/rules/index.js', () => ({ buildRuleSet: vi.fn() }));
vi.mock('../../src/renderers/index.js', () => ({ renderTargets: vi.fn(), getRenderer: vi.fn() }));
vi.mock('../../src/writer/index.js', () => ({
  planWrites: vi.fn(),
  planWrite: vi.fn(),
  applyPlans: vi.fn(),
}));
vi.mock('../../src/doctor/index.js', () => ({
  runDoctor: vi.fn(),
  parseInstructionFiles: vi.fn(),
}));
vi.mock('../../src/ai/index.js', () => ({ enhanceWithAi: vi.fn() }));
vi.mock('../../src/cli/prompts.js', () => ({
  prompts: { selectTargets: vi.fn(), confirm: vi.fn() },
}));

import { detectTargets, defaultTargets, stackSummary } from '../../src/cli/commands/init.js';
import { run } from '../../src/cli/index.js';
import { prompts } from '../../src/cli/prompts.js';
import { loadConfig } from '../../src/config/index.js';
import { createMemoryFileIndex } from '../../src/core/file-index.js';
import { renderTargets } from '../../src/renderers/index.js';
import { buildRuleSet } from '../../src/rules/index.js';
import { scan } from '../../src/scanner/index.js';
import { applyPlans, planWrites } from '../../src/writer/index.js';
import {
  captureIO,
  fakeApply,
  fakeFacts,
  fakePlanner,
  fakeRender,
  fakeRuleSet,
} from './helpers.js';

let root: string;

async function cli(args: string[], overrides = {}) {
  const cap = captureIO(root, overrides);
  const code = await run(args, cap.io);
  return { code, stdout: cap.stdout(), stderr: cap.stderr() };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ai-rules-init-'));
  vi.mocked(scan).mockImplementation((r) => fakeFacts(r));
  vi.mocked(buildRuleSet).mockImplementation(() => fakeRuleSet());
  vi.mocked(renderTargets).mockImplementation(fakeRender);
  vi.mocked(planWrites).mockImplementation(fakePlanner());
  vi.mocked(applyPlans).mockImplementation(fakeApply);
});

afterEach(() => {
  vi.clearAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('target detection', () => {
  it('preselects agents the repo already uses', () => {
    const facts = fakeFacts(root);
    expect(detectTargets(facts)).toEqual(['cursor']);
    expect(defaultTargets(facts)).toEqual(['agents', 'claude', 'cursor']);
    const bare = {
      ...facts,
      facts: [],
      files: createMemoryFileIndex({ '.github/copilot-instructions.md': '', 'GEMINI.md': '' }),
    };
    expect(defaultTargets(bare)).toEqual(['agents', 'claude', 'copilot', 'gemini']);
  });

  it('summarises the stack per scope', () => {
    expect(stackSummary(fakeFacts(root))).toEqual([
      '  root      typescript · pnpm',
      '  apps/api  nestjs',
    ]);
  });
});

describe('init', () => {
  it('--yes writes the config with defaults and generates', async () => {
    const r = await cli(['init', '--yes']);
    expect(r.code).toBe(0);
    expect(prompts.selectTargets).not.toHaveBeenCalled();
    expect(loadConfig(root)).toMatchObject({
      path: '.ai-rules/config.yaml',
      config: { targets: ['agents', 'claude', 'cursor'] },
    });
    expect(vi.mocked(renderTargets).mock.calls[0]![1]).toEqual(['agents', 'claude', 'cursor']);
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(true);
    expect(r.stdout).toContain('detected demo-app');
    expect(r.stdout).toContain('created .ai-rules/config.yaml');
    expect(r.stdout).toContain('ai-rules doctor');
    expect(r.stdout).toContain('check');
  });

  it('non-TTY runs without prompts', async () => {
    expect((await cli(['init'])).code).toBe(0);
    expect(prompts.selectTargets).not.toHaveBeenCalled();
    expect(prompts.confirm).not.toHaveBeenCalled();
  });

  it('keeps an existing config', async () => {
    writeFileSync(join(root, '.ai-rules.yaml'), 'targets: [gemini]\n');
    const r = await cli(['init', '--yes']);
    expect(r.code).toBe(0);
    expect(existsSync(join(root, '.ai-rules/config.yaml'))).toBe(false);
    expect(readFileSync(join(root, '.ai-rules.yaml'), 'utf8')).toBe('targets: [gemini]\n');
    expect(vi.mocked(renderTargets).mock.calls[0]![1]).toEqual(['gemini']);
  });

  it('prompts on a TTY', async () => {
    vi.mocked(prompts.selectTargets).mockResolvedValue(['copilot']);
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    const r = await cli(['init'], { isTTY: true });
    expect(r.code).toBe(0);
    expect(prompts.selectTargets).toHaveBeenCalledWith(['agents', 'claude', 'cursor']);
    expect(loadConfig(root).config.targets).toEqual(['copilot']);
  });

  it('writes nothing when cancelled', async () => {
    vi.mocked(prompts.selectTargets).mockResolvedValue(undefined);
    const r = await cli(['init'], { isTTY: true });
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('Cancelled');
    expect(existsSync(join(root, '.ai-rules'))).toBe(false);
    expect(renderTargets).not.toHaveBeenCalled();
  });

  it('asks before overwriting hand-edited blocks', async () => {
    vi.mocked(planWrites).mockImplementation(fakePlanner({ 'CLAUDE.md': 'conflict' }));
    vi.mocked(prompts.selectTargets).mockResolvedValue(['agents', 'claude']);
    vi.mocked(prompts.confirm).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    const r = await cli(['init'], { isTTY: true });
    expect(r.code).toBe(0);
    expect(vi.mocked(planWrites).mock.calls[1]![2]).toEqual({ force: true });
    expect(existsSync(join(root, 'CLAUDE.md'))).toBe(true);
  });

  it('leaves conflicts alone without confirmation', async () => {
    vi.mocked(planWrites).mockImplementation(fakePlanner({ 'CLAUDE.md': 'conflict' }));
    const r = await cli(['init', '--yes']);
    expect(r.code).toBe(1);
    expect(existsSync(join(root, 'CLAUDE.md'))).toBe(false);
    expect(r.stderr).toContain('--force');
  });

  it('--target and --dry-run write nothing', async () => {
    const r = await cli(['init', '--target', 'gemini', '--dry-run']);
    expect(r.code).toBe(0);
    expect(vi.mocked(renderTargets).mock.calls[0]![1]).toEqual(['gemini']);
    expect(existsSync(join(root, '.ai-rules'))).toBe(false);
    expect(applyPlans).not.toHaveBeenCalled();
  });
});
