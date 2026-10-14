import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { run } from '../../src/cli/index.js';

const FIXTURES = fileURLToPath(new URL('../fixtures', import.meta.url));
const ALL_TARGETS = 'agents,claude,cursor,copilot,gemini';

/** Copy a fixture into a temp dir so tests can write to it. */
function copyFixture(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `ai-rules-e2e-${name}-`));
  cpSync(join(FIXTURES, name), dir, { recursive: true });
  return dir;
}

async function cli(cwd: string, ...argv: string[]): Promise<{ code: number; out: string }> {
  let out = '';
  const code = await run(argv, {
    cwd,
    isTTY: false,
    env: { NO_COLOR: '1' },
    stdout: (t) => (out += t),
    stderr: (t) => (out += t),
  });
  return { code, out };
}

const STACK_FIXTURES = readdirSync(FIXTURES).filter((n) => n !== 'messy-rules');

describe('end to end: generate → doctor → check', () => {
  it.each(STACK_FIXTURES)(
    '%s: generated files pass the doctor and are idempotent',
    async (name) => {
      const dir = copyFixture(name);
      const gen = await cli(dir, 'generate', '--target', ALL_TARGETS);
      expect(gen.code, gen.out).toBe(0);
      expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toContain('<!-- ai-rules:begin');

      // The generator's own output must never trip the linter.
      const doctor = await cli(dir, 'doctor', '--format', 'json', '--strict');
      const report = JSON.parse(doctor.out) as {
        findings: { severity: string; message: string }[];
      };
      expect(report.findings.filter((f) => f.severity !== 'info')).toEqual([]);
      expect(doctor.code).toBe(0);

      const again = await cli(dir, 'generate', '--target', ALL_TARGETS, '--json');
      const plans = JSON.parse(again.out) as { status: string }[] | { plans: { status: string }[] };
      const list = Array.isArray(plans) ? plans : plans.plans;
      expect(list.every((p) => p.status === 'unchanged')).toBe(true);

      expect((await cli(dir, 'check')).code).toBe(0);
    },
  );
});

describe('end to end: messy repo', () => {
  it('doctor reports the planted problems', async () => {
    const dir = copyFixture('messy-rules');
    const { code, out } = await cli(dir, 'doctor', '--format', 'json');
    expect(code).toBe(1);
    const ids = new Set(
      (JSON.parse(out) as { findings: { checkId: string }[] }).findings.map((f) => f.checkId),
    );
    for (const id of [
      'conflict/repo',
      'conflict/files',
      'stale/command',
      'stale/path',
      'duplicate',
      'legacy',
      'budget',
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it('check fails until generate runs, and generate keeps hand-written text', async () => {
    const dir = copyFixture('messy-rules');
    expect((await cli(dir, 'check')).code).toBe(1);

    const before = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
    expect((await cli(dir, 'generate')).code).toBe(0);
    const after = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
    // existing content is preserved, generated blocks are appended
    expect(after.startsWith(before.trimEnd())).toBe(true);
    expect(after).toContain('<!-- ai-rules:begin id=commands');
  });

  it('a hand-edited managed block is a conflict unless --force', async () => {
    const dir = copyFixture('react-vite');
    await cli(dir, 'generate');
    const file = join(dir, 'AGENTS.md');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('## Commands', '## Commands\n- my own note'),
    );
    expect((await cli(dir, 'generate')).code).toBe(1);
    expect(readFileSync(file, 'utf8')).toContain('my own note');
    expect((await cli(dir, 'generate', '--force')).code).toBe(0);
    expect(readFileSync(file, 'utf8')).not.toContain('my own note');
  });

  it('explain shows the evidence behind a rule', async () => {
    const dir = copyFixture('nestjs-pnpm');
    const { code, out } = await cli(dir, 'explain', 'pnpm');
    expect(code).toBe(0);
    expect(out).toContain('pnpm-lock.yaml');
  });

  it('scan --json and doctor --format sarif produce valid JSON', async () => {
    const dir = copyFixture('monorepo');
    const scan = JSON.parse((await cli(dir, 'scan', '--json')).out) as { workspaces: unknown[] };
    expect(scan.workspaces.length).toBeGreaterThan(1);
    const sarif = JSON.parse((await cli(dir, 'doctor', '--format', 'sarif')).out) as {
      version: string;
    };
    expect(sarif.version).toBe('2.1.0');
  });
});
