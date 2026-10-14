import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/scanner/index.js', () => ({ scan: vi.fn(), scanFiles: vi.fn() }));
vi.mock('../../src/rules/index.js', () => ({ buildRuleSet: vi.fn() }));
vi.mock('../../src/renderers/index.js', () => ({ renderTargets: vi.fn(), getRenderer: vi.fn() }));
vi.mock('../../src/writer/index.js', () => ({ planWrites: vi.fn(), planWrite: vi.fn(), applyPlans: vi.fn() }));
vi.mock('../../src/doctor/index.js', () => ({ runDoctor: vi.fn(), parseInstructionFiles: vi.fn() }));
vi.mock('../../src/ai/index.js', () => ({ enhanceWithAi: vi.fn() }));

import { enhanceWithAi } from '../../src/ai/index.js';
import { run } from '../../src/cli/index.js';
import { runDoctor } from '../../src/doctor/index.js';
import { renderTargets } from '../../src/renderers/index.js';
import { buildRuleSet } from '../../src/rules/index.js';
import { scan } from '../../src/scanner/index.js';
import type { WriteStatus } from '../../src/types.js';
import { applyPlans, planWrites } from '../../src/writer/index.js';
import {
  captureIO,
  fakeApply,
  fakeFacts,
  fakePlanner,
  fakeRender,
  fakeRuleSet,
  sampleFindings,
} from './helpers.js';

let root: string;

function setStatuses(statuses: Record<string, WriteStatus>): void {
  vi.mocked(planWrites).mockImplementation(fakePlanner(statuses));
}

async function cli(args: string[], overrides = {}) {
  const cap = captureIO(root, overrides);
  const code = await run(args, cap.io);
  return { code, stdout: cap.stdout(), stderr: cap.stderr() };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ai-rules-cli-'));
  vi.mocked(scan).mockImplementation((r) => fakeFacts(r));
  vi.mocked(buildRuleSet).mockImplementation(() => fakeRuleSet());
  vi.mocked(renderTargets).mockImplementation(fakeRender);
  setStatuses({});
  vi.mocked(applyPlans).mockImplementation(fakeApply);
  vi.mocked(runDoctor).mockReturnValue([]);
  vi.mocked(enhanceWithAi).mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('program', () => {
  it('prints the package version', async () => {
    const r = await cli(['--version']);
    expect(r).toMatchObject({ code: 0, stdout: '0.1.0\n' });
  });

  it('prints help listing every command', async () => {
    const r = await cli(['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^Usage: ai-rules \[options\] \[command\]/);
    for (const cmd of ['init', 'scan', 'generate', 'doctor', 'check', 'explain']) {
      expect(r.stdout).toMatch(new RegExp(`^ {2}${cmd}\\b`, 'm'));
    }
    for (const opt of ['--cwd', '--json', '--no-color', '--quiet']) expect(r.stdout).toContain(opt);
  });

  it('returns 2 on usage errors and unknown commands', async () => {
    expect((await cli(['frobnicate'])).code).toBe(2);
    const r = await cli(['doctor', '--format', 'xml']);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^ai-rules: .*xml/);
  });

  it('reports config errors with exit 2', async () => {
    mkdirSync(join(root, '.ai-rules'));
    writeFileSync(join(root, '.ai-rules/config.yaml'), 'doctor:\n  failOn: never\n');
    const r = await cli(['scan']);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^ai-rules: \.ai-rules\/config\.yaml: doctor\.failOn: Invalid enum value/);
    expect(r.stderr).not.toContain('    at ');
  });

  it('prints stacks for unexpected errors only with DEBUG=ai-rules', async () => {
    vi.mocked(scan).mockImplementation(() => {
      throw new Error('boom');
    });
    expect(await cli(['scan'])).toMatchObject({ code: 2, stderr: 'ai-rules: boom\n' });
    const dbg = await cli(['scan'], { env: { DEBUG: 'ai-rules' } });
    expect(dbg.stderr).toMatch(/ai-rules: boom\nError: boom\n {4}at /);
  });

  it('resolves --cwd relative to the working directory', async () => {
    mkdirSync(join(root, 'sub'));
    await cli(['--cwd', 'sub', 'scan']);
    expect(vi.mocked(scan).mock.calls[0]![0]).toBe(join(root, 'sub'));
    const r = await cli(['scan', '--cwd', 'missing']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('not a directory');
  });

  it('uses colours only on a TTY without NO_COLOR / --no-color', async () => {
    expect((await cli(['scan'], { isTTY: true })).stdout).toContain('\u001b[');
    expect((await cli(['scan'], { isTTY: true, env: { NO_COLOR: '1' } })).stdout).not.toContain('\u001b[');
    expect((await cli(['scan', '--no-color'], { isTTY: true })).stdout).not.toContain('\u001b[');
    expect((await cli(['scan'])).stdout).not.toContain('\u001b[');
  });
});

describe('scan', () => {
  it('prints facts grouped by scope with evidence', async () => {
    const r = await cli(['scan']);
    expect(r.code).toBe(0);
    const lines = r.stdout.split('\n');
    expect(lines[0]).toBe('demo-app — A demo monorepo');
    expect(lines).toContain('root');
    expect(lines).toContain('  language        : typescript  (tsconfig.json)');
    expect(lines).toContain('  package manager : pnpm  (pnpm-lock.yaml)');
    expect(lines).toContain('  agent file      : .cursor/rules/old.mdc [cursor]  (.cursor/rules/old.mdc)');
    expect(lines).toContain('  commands:');
    expect(lines).toContain('    test  pnpm test  (package.json#scripts.test)');
    expect(lines).toContain('apps/api (@demo/api)');
    expect(lines).toContain('  framework : nestjs 10.2.0  (apps/api/package.json#dependencies.@nestjs/core)');
  });

  it('--json dumps facts without the file index', async () => {
    const r = await cli(['scan', '--json']);
    const data = JSON.parse(r.stdout);
    expect(Object.keys(data).sort()).toEqual(['description', 'facts', 'name', 'scripts', 'workspaces']);
    expect(data.facts).toHaveLength(5);
  });

  it('passes config ignores to the scanner', async () => {
    writeFileSync(join(root, '.ai-rules.yaml'), 'ignore: ["legacy/**"]\n');
    await cli(['scan']);
    expect(scan).toHaveBeenCalledWith(root, { ignore: ['legacy/**'] });
  });
});

describe('generate', () => {
  it('writes files for the configured targets', async () => {
    const r = await cli(['generate']);
    expect(r.code).toBe(0);
    expect(vi.mocked(renderTargets).mock.calls[0]![1]).toEqual(['agents', 'claude']);
    expect(vi.mocked(renderTargets).mock.calls[0]![2]).toEqual({ claudeMode: 'import', evidence: 'none' });
    expect(r.stdout).toMatch(/^ {2}create {2}AGENTS\.md$/m);
    expect(r.stdout).toContain('2 file(s) written');
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(true);
  });

  it('--dry-run writes nothing', async () => {
    const r = await cli(['generate', '--dry-run']);
    expect(r.code).toBe(0);
    expect(applyPlans).not.toHaveBeenCalled();
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false);
    expect(r.stdout).toContain('Dry run: 2 file(s) would be written');
  });

  it('prints the status table and diffs', async () => {
    setStatuses({ 'AGENTS.md': 'update', 'CLAUDE.md': 'unchanged' });
    const r = await cli(['generate', '--dry-run', '--diff']);
    expect(r.stdout).toContain('  update     AGENTS.md\n  unchanged  CLAUDE.md');
    expect(r.stdout).toContain('+++ b/AGENTS.md');
    expect(r.stdout).not.toContain('+++ b/CLAUDE.md');
  });

  it('parses --target lists', async () => {
    await cli(['generate', '--target', 'cursor, agents,cursor', '--dry-run']);
    expect(vi.mocked(renderTargets).mock.calls[0]![1]).toEqual(['cursor', 'agents']);
  });

  it('rejects unknown targets with exit 2', async () => {
    const r = await cli(['generate', '--target', 'agents,windsurf']);
    expect(r.code).toBe(2);
    expect(r.stderr).toBe(
      'ai-rules: unknown target "windsurf" (expected: agents, claude, cursor, copilot, gemini)\n',
    );
    expect(renderTargets).not.toHaveBeenCalled();
  });

  it('exits 1 on conflicts and suggests --force', async () => {
    setStatuses({ 'CLAUDE.md': 'conflict' });
    const r = await cli(['generate']);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('  conflict  CLAUDE.md  (edited by hand: commands)');
    expect(r.stderr).toContain('--force');
    expect(existsSync(join(root, 'CLAUDE.md'))).toBe(false);
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(true);
  });

  it('--force passes through to the planner', async () => {
    setStatuses({ 'CLAUDE.md': 'conflict' });
    expect((await cli(['generate', '--force'])).code).toBe(0);
    expect(vi.mocked(planWrites).mock.calls[0]![2]).toEqual({ force: true });
  });

  it('--with-evidence and config options reach the renderer', async () => {
    writeFileSync(join(root, '.ai-rules.yaml'), 'claude: { mode: full }\ntargets: [gemini]\n');
    await cli(['generate', '--with-evidence', '--dry-run']);
    expect(vi.mocked(renderTargets).mock.calls[0]!.slice(1)).toEqual([
      ['gemini'],
      { claudeMode: 'full', evidence: 'comment' },
    ]);
  });

  it('--json prints plans without content', async () => {
    setStatuses({ 'CLAUDE.md': 'unchanged' });
    const r = await cli(['generate', '--json', '--dry-run']);
    const data = JSON.parse(r.stdout);
    expect(data).toEqual({
      dryRun: true,
      targets: ['agents', 'claude'],
      plans: [
        { path: 'AGENTS.md', target: 'agents', status: 'create', conflicts: [] },
        { path: 'CLAUDE.md', target: 'claude', status: 'unchanged', conflicts: [] },
      ],
      written: [],
    });
  });

  it('--ai appends inferred rules and survives AI failures', async () => {
    const inferred = { ...fakeRuleSet().rules[0]!, id: 'ai/1', pack: 'ai', inferred: true };
    vi.mocked(enhanceWithAi).mockResolvedValue([inferred]);
    await cli(['generate', '--ai', '--dry-run']);
    expect(vi.mocked(renderTargets).mock.calls[0]![0].rules.map((r) => r.id)).toContain('ai/1');

    vi.mocked(enhanceWithAi).mockRejectedValue(new Error('connection refused'));
    const r = await cli(['generate', '--ai', '--dry-run']);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('AI step failed, continuing without inferred rules: connection refused');
  });

  it('never calls the AI step without --ai', async () => {
    await cli(['generate', '--dry-run']);
    expect(enhanceWithAi).not.toHaveBeenCalled();
  });

  it('--quiet hides the table', async () => {
    const r = await cli(['generate', '--quiet']);
    expect(r).toMatchObject({ code: 0, stdout: '' });
  });
});

describe('doctor', () => {
  it('exits 0 when clean', async () => {
    const r = await cli(['doctor']);
    expect(r).toMatchObject({ code: 0, stdout: '✔ No problems found\n' });
  });

  it('exits 1 on errors and renders the human report', async () => {
    vi.mocked(runDoctor).mockReturnValue(sampleFindings);
    const r = await cli(['doctor']);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('  ✖ conflict/repo  CLAUDE.md:3  says npm but repo uses pnpm');
    expect(r.stdout).toContain('Tokens\n  ℹ Claude Code ≈ 1.2k tokens');
    expect(r.stdout).toContain('✖ 1 error, 1 warning');
  });

  it('warnings fail only with --strict or failOn: warning', async () => {
    vi.mocked(runDoctor).mockReturnValue(sampleFindings.slice(1));
    expect((await cli(['doctor'])).code).toBe(0);
    expect((await cli(['doctor', '--strict'])).code).toBe(1);
    writeFileSync(join(root, '.ai-rules.yaml'), 'doctor: { failOn: warning }\n');
    expect((await cli(['doctor'])).code).toBe(1);
  });

  it('supports json and sarif formats', async () => {
    vi.mocked(runDoctor).mockReturnValue(sampleFindings);
    const json = JSON.parse((await cli(['doctor', '--format', 'json'])).stdout);
    expect(json).toEqual({ findings: sampleFindings, summary: { errors: 1, warnings: 1, infos: 1 }, failed: true });
    expect(JSON.parse((await cli(['doctor', '--json'])).stdout).summary.errors).toBe(1);
    const sarif = JSON.parse((await cli(['doctor', '--format', 'sarif'])).stdout);
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].tool.driver.version).toBe('0.1.0');
    expect(sarif.runs[0].results).toHaveLength(3);
  });

  it('passes the loaded config to runDoctor', async () => {
    writeFileSync(join(root, '.ai-rules.yaml'), 'doctor: { disable: [budget] }\n');
    await cli(['doctor']);
    expect(vi.mocked(runDoctor).mock.calls[0]![1].doctor.disable).toEqual(['budget']);
  });
});

describe('check', () => {
  it('passes when doctor is clean and files are up to date', async () => {
    setStatuses({ 'AGENTS.md': 'unchanged', 'CLAUDE.md': 'unchanged' });
    const r = await cli(['check']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('generated files are up to date (2 checked)');
    expect(applyPlans).not.toHaveBeenCalled();
  });

  it('fails when generated files are out of date', async () => {
    setStatuses({ 'AGENTS.md': 'update', 'CLAUDE.md': 'unchanged' });
    const r = await cli(['check']);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('outdated  AGENTS.md  generated file is out of date');
    expect(r.stderr).toContain('1 generated file(s) out of date: AGENTS.md');
    expect(r.stderr).toContain('run "ai-rules generate"');
    expect(applyPlans).not.toHaveBeenCalled();
  });

  it('fails when doctor fails', async () => {
    setStatuses({ 'AGENTS.md': 'unchanged', 'CLAUDE.md': 'unchanged' });
    vi.mocked(runDoctor).mockReturnValue(sampleFindings.slice(1));
    expect((await cli(['check'])).code).toBe(0);
    expect((await cli(['check', '--strict'])).code).toBe(1);
    vi.mocked(runDoctor).mockReturnValue(sampleFindings);
    expect((await cli(['check'])).code).toBe(1);
  });

  it('reports out-of-date files in json and sarif', async () => {
    setStatuses({ 'AGENTS.md': 'create', 'CLAUDE.md': 'conflict' });
    const json = JSON.parse((await cli(['check', '--json'])).stdout);
    expect(json.failed).toBe(true);
    expect(json.outOfDate).toEqual([
      { path: 'AGENTS.md', status: 'create' },
      { path: 'CLAUDE.md', status: 'conflict' },
    ]);
    const sarif = JSON.parse((await cli(['check', '--format', 'sarif'])).stdout);
    expect(sarif.runs[0].results.map((r: { ruleId: string }) => r.ruleId)).toEqual(['outdated', 'outdated']);
  });
});

describe('explain', () => {
  it('matches an exact rule id', async () => {
    const r = await cli(['explain', 'nestjs/modules']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      [
        'nestjs/modules',
        '  pack     nestjs',
        '  scope    apps/api',
        '  section  architecture',
        '  text     Group features into Nest modules.',
        '  evidence',
        '    - apps/api/package.json#dependencies.@nestjs/core (line 12)',
        '',
      ].join('\n'),
    );
  });

  it('falls back to a case-insensitive text search', async () => {
    const r = await cli(['explain', 'USE `PNPM`']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('common/package-manager');
    expect(r.stdout).toContain('scope    root');
    expect(r.stdout).toContain('    - pnpm-lock.yaml');
  });

  it('exits 1 when nothing matches', async () => {
    const r = await cli(['explain', 'kubernetes']);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('No rule matches "kubernetes"');
  });

  it('--json returns the matched rules', async () => {
    const data = JSON.parse((await cli(['explain', 'nest', '--json'])).stdout);
    expect(data.query).toBe('nest');
    expect(data.rules.map((r: { id: string }) => r.id)).toEqual(['nestjs/modules']);
  });
});
