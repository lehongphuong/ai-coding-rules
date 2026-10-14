import type { Severity } from '../../types.js';
import type { ReportFinding } from './summary.js';

export const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
export const INFORMATION_URI = 'https://www.npmjs.com/package/ai-coding-rules';

const RULE_DESCRIPTIONS: Record<string, string> = {
  'conflict/repo':
    'Instruction contradicts the repository (e.g. wrong package manager or test runner).',
  'conflict/files': 'Two instruction files for the same scope contradict each other.',
  'stale/command': 'Instruction references a script that does not exist.',
  'stale/path': 'Instruction references a path that does not exist.',
  duplicate: 'Near-duplicate section across instruction files.',
  budget: 'Instruction files exceed the token budget.',
  legacy: 'Legacy instruction file format.',
  empty: 'Instruction file has no content.',
  outdated: 'Generated instruction file is out of date; run "ai-rules generate".',
};

const LEVELS: Record<Severity, 'error' | 'warning' | 'note'> = {
  error: 'error',
  warning: 'warning',
  info: 'note',
};

type SarifLevel = (typeof LEVELS)[Severity];

interface SarifLocation {
  physicalLocation: {
    artifactLocation: { uri: string };
    region: { startLine: number; endLine?: number };
  };
}

export interface SarifLog {
  $schema: string;
  version: '2.1.0';
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version?: string;
        informationUri: string;
        rules: Array<{
          id: string;
          name: string;
          shortDescription: { text: string };
          defaultConfiguration: { level: SarifLevel };
        }>;
      };
    };
    results: Array<{
      ruleId: string;
      ruleIndex: number;
      level: SarifLevel;
      message: { text: string };
      locations: SarifLocation[];
      relatedLocations?: Array<SarifLocation & { id: number }>;
    }>;
  }>;
}

function location(f: { file: string; line?: number; endLine?: number }): SarifLocation {
  const startLine = Math.max(1, f.line ?? 1);
  const region: SarifLocation['physicalLocation']['region'] = { startLine };
  if (f.endLine && f.endLine >= startLine) region.endLine = f.endLine;
  return { physicalLocation: { artifactLocation: { uri: f.file }, region } };
}

/** SARIF 2.1.0 log (one run) for GitHub code scanning. */
export function sarifReport(findings: readonly ReportFinding[], version?: string): SarifLog {
  const ruleIds = [...new Set(findings.map((f) => f.checkId))].sort();
  const worst = (id: string): SarifLevel => {
    const sev = findings.filter((f) => f.checkId === id).map((f) => f.severity);
    return LEVELS[sev.includes('error') ? 'error' : sev.includes('warning') ? 'warning' : 'info'];
  };
  return {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'ai-coding-rules',
            ...(version ? { version } : {}),
            informationUri: INFORMATION_URI,
            rules: ruleIds.map((id) => ({
              id,
              name: id,
              shortDescription: { text: RULE_DESCRIPTIONS[id] ?? id },
              defaultConfiguration: { level: worst(id) },
            })),
          },
        },
        results: findings.map((f) => {
          const text = f.hint ? `${f.message} (${f.hint})` : f.message;
          return {
            ruleId: f.checkId,
            ruleIndex: ruleIds.indexOf(f.checkId),
            level: LEVELS[f.severity],
            message: { text },
            locations: f.file ? [location(f)] : [],
            ...(f.related?.length
              ? { relatedLocations: f.related.map((r, i) => ({ id: i + 1, ...location(r) })) }
              : {}),
          };
        }),
      },
    ],
  };
}

export function renderSarif(findings: readonly ReportFinding[], version?: string): string {
  return JSON.stringify(sarifReport(findings, version), null, 2);
}
