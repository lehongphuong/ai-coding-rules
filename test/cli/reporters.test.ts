import pc from 'picocolors';
import { describe, expect, it } from 'vitest';
import { renderHuman } from '../../src/cli/reporters/human.js';
import { jsonReport, renderJson } from '../../src/cli/reporters/json.js';
import { sarifReport } from '../../src/cli/reporters/sarif.js';
import { failed, summarize, type ReportFinding } from '../../src/cli/reporters/summary.js';
import type { Finding } from '../../src/types.js';

const c = pc.createColors(false);

const findings: Finding[] = [
  {
    checkId: 'conflict/repo',
    severity: 'error',
    message: '"run tests with npm test" but the repo uses pnpm (pnpm-lock.yaml)',
    file: 'CLAUDE.md',
    line: 12,
    hint: 'Use `pnpm test`',
  },
  {
    checkId: 'duplicate',
    severity: 'warning',
    message: 'Section is 92% similar to AGENTS.md:15-33',
    file: 'CLAUDE.md',
    line: 20,
    endLine: 38,
    related: [{ file: 'AGENTS.md', line: 15, endLine: 33 }],
    hint: 'Import AGENTS.md with @AGENTS.md instead',
  },
  {
    checkId: 'stale/command',
    severity: 'warning',
    message: 'Script `test:e2e` is not defined in package.json',
    file: 'AGENTS.md',
    line: 41,
  },
  {
    checkId: 'legacy',
    severity: 'info',
    message: 'Migrate to .cursor/rules/*.mdc',
    file: '.cursorrules',
  },
  {
    checkId: 'budget',
    severity: 'info',
    message: 'Claude Code ≈ 3.5k tokens (CLAUDE.md, AGENTS.md)',
    file: 'CLAUDE.md',
  },
];

describe('summary helpers', () => {
  it('counts severities and applies failOn', () => {
    expect(summarize(findings)).toEqual({ errors: 1, warnings: 2, infos: 2 });
    expect(failed(findings, 'error')).toBe(true);
    const warnOnly = findings.filter((f) => f.severity !== 'error');
    expect(failed(warnOnly, 'error')).toBe(false);
    expect(failed(warnOnly, 'warning')).toBe(true);
    expect(failed([], 'warning')).toBe(false);
  });
});

describe('human reporter', () => {
  it('groups by file with icons, hints and token lines', () => {
    expect(renderHuman(findings, c)).toBe(
      [
        'CLAUDE.md',
        '  ✖ conflict/repo  CLAUDE.md:12     "run tests with npm test" but the repo uses pnpm (pnpm-lock.yaml)',
        '    ↳ Use `pnpm test`',
        '  ⚠ duplicate      CLAUDE.md:20-38  Section is 92% similar to AGENTS.md:15-33',
        '    ↳ see AGENTS.md:15-33',
        '    ↳ Import AGENTS.md with @AGENTS.md instead',
        '',
        'AGENTS.md',
        '  ⚠ stale/command  AGENTS.md:41  Script `test:e2e` is not defined in package.json',
        '',
        '.cursorrules',
        '  ℹ legacy         .cursorrules  Migrate to .cursor/rules/*.mdc',
        '',
        'Tokens',
        '  ℹ Claude Code ≈ 3.5k tokens (CLAUDE.md, AGENTS.md)',
        '',
        '✖ 1 error, 2 warnings',
      ].join('\n'),
    );
  });

  it('prints a clean result when nothing is wrong', () => {
    expect(renderHuman([], c)).toBe('✔ No problems found');
    expect(
      renderHuman(
        [findings[2]!].map((f) => ({ ...f, severity: 'warning' as const })),
        c,
      ),
    ).toMatch(/⚠ 0 errors, 1 warning$/);
  });

  it('adds ANSI colours only when enabled', () => {
    expect(renderHuman(findings, pc.createColors(true))).toContain('\u001b[31m');
    expect(renderHuman(findings, c)).not.toContain('\u001b[');
  });
});

describe('json reporter', () => {
  it('returns findings and summary', () => {
    expect(jsonReport(findings)).toEqual({
      findings,
      summary: { errors: 1, warnings: 2, infos: 2 },
    });
    expect(JSON.parse(renderJson(findings, { failed: true }))).toMatchObject({
      failed: true,
      summary: { errors: 1 },
    });
  });
});

describe('sarif reporter', () => {
  it('produces a SARIF 2.1.0 log', () => {
    const extra: ReportFinding = {
      checkId: 'outdated',
      severity: 'error',
      message: 'AGENTS.md is out of date',
      file: 'AGENTS.md',
    };
    const log = sarifReport(
      [...findings, extra, { checkId: 'budget', severity: 'warning', message: 'over', file: '' }],
      '1.2.3',
    );
    expect(log.$schema).toMatch(/sarif-2\.1\.0/);
    expect(log.version).toBe('2.1.0');
    expect(log.runs).toHaveLength(1);
    const run = log.runs[0]!;
    expect(run.tool.driver).toMatchObject({ name: 'ai-coding-rules', version: '1.2.3' });
    expect(run.tool.driver.informationUri).toMatch(/^https:\/\//);
    expect(run.tool.driver.rules.map((r) => r.id)).toEqual([
      'budget',
      'conflict/repo',
      'duplicate',
      'legacy',
      'outdated',
      'stale/command',
    ]);
    expect(run.tool.driver.rules.find((r) => r.id === 'budget')?.defaultConfiguration.level).toBe(
      'warning',
    );
    expect(run.results.map((r) => r.level)).toEqual([
      'error',
      'warning',
      'warning',
      'note',
      'note',
      'error',
      'warning',
    ]);
    for (const r of run.results) {
      expect(run.tool.driver.rules[r.ruleIndex]!.id).toBe(r.ruleId);
      expect(r.message.text.length).toBeGreaterThan(0);
      for (const loc of r.locations)
        expect(loc.physicalLocation.region.startLine).toBeGreaterThanOrEqual(1);
    }
    expect(run.results[0]).toMatchObject({
      ruleId: 'conflict/repo',
      message: { text: expect.stringContaining('Use `pnpm test`') },
      locations: [
        { physicalLocation: { artifactLocation: { uri: 'CLAUDE.md' }, region: { startLine: 12 } } },
      ],
    });
    expect(run.results[1]!.locations[0]!.physicalLocation.region).toEqual({
      startLine: 20,
      endLine: 38,
    });
    expect(run.results[1]!.relatedLocations?.[0]).toMatchObject({ id: 1 });
    expect(run.results[3]!.locations[0]!.physicalLocation.region.startLine).toBe(1);
    expect(run.results[6]!.locations).toEqual([]);
  });
});
