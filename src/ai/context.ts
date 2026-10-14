import type { Fact, ProjectFacts } from '../types.js';

export const MAX_TREE_ENTRIES = 200;
export const MAX_SAMPLES = 5;
export const MAX_SAMPLE_BYTES = 4096;

/** File names that must never leave the machine. Matched against the basename. */
const SECRET_FILE_PATTERNS: RegExp[] = [
  /^\.env/i,
  /\.pem$/i,
  /\.key$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /secret/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.jks$/i,
  /\.keystore$/i,
  /^credentials/i,
  /^\.?netrc$/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^\.htpasswd$/i,
  /^auth\.json$/i,
  /^service-account.*\.json$/i,
];

/** Lines that look like they assign a secret. */
const SECRET_LINE = /(api[_-]?key|secret|token|password)\s*[:=]/i;

/** True for files we never send to an AI provider (also checks every directory segment for "secret"). */
export function isSensitivePath(path: string): boolean {
  const parts = path.split('/');
  const base = parts[parts.length - 1] ?? '';
  if (SECRET_FILE_PATTERNS.some((re) => re.test(base))) return true;
  return parts.slice(0, -1).some((seg) => /secret|^\.ssh$|^\.aws$|^\.gnupg$/i.test(seg));
}

/** Replace lines that look like secret assignments. */
export function redactSecrets(text: string): string {
  return text
    .split('\n')
    .map((line) => (SECRET_LINE.test(line) ? `${line.match(/^\s*/)?.[0] ?? ''}[redacted]` : line))
    .join('\n');
}

/** Preferred sample files, relative to a workspace dir. */
const ENTRY_POINTS = [
  'src/main.ts',
  'src/index.ts',
  'src/app.ts',
  'src/server.ts',
  'src/main.tsx',
  'src/App.tsx',
  'src/App.vue',
  'src/main.js',
  'src/index.js',
  'src/app.module.ts',
  'app/page.tsx',
  'app/layout.tsx',
  'pages/index.tsx',
  'lib/main.dart',
  'lib/app.dart',
  'app/Http/Kernel.php',
  'routes/web.php',
  'routes/api.php',
  'app/Providers/AppServiceProvider.php',
  'manage.py',
  'app/main.py',
  'main.py',
  'main.go',
  'index.ts',
  'index.js',
];

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|vue|svelte|dart|php|py|go|java|kt|rb|rs|cs|swift)$/;
const TEST_FILE =
  /(^|\/)(test|tests|__tests__|spec)\/|\.(test|spec)\.|_test\.(go|dart)$|Test\.(php|java|kt)$/;
const GENERATED_FILE = /\.(min|g|freezed|gen)\.|\.d\.ts$/;

/** Build the user prompt sent to the provider. Never includes secret files; redacts secret-looking lines. */
export function buildAiContext(facts: ProjectFacts): string {
  const out: string[] = [];
  out.push(`# Project: ${facts.name}`);
  if (facts.description) out.push(redactSecrets(facts.description));
  out.push('', '## Detected facts (key=value, grouped by scope)');
  out.push(...factLines(facts));
  out.push('', '## File tree (top levels)');
  out.push(...buildTree(facts.files.paths));
  const samples = pickSamples(facts);
  if (samples.length > 0) {
    out.push('', '## Sample source files');
    for (const s of samples) {
      out.push('', `### ${s.path}`, '```', s.content, '```');
    }
  }
  return `${out.join('\n')}\n`;
}

function factLines(facts: ProjectFacts): string[] {
  const scopes = facts.workspaces.length > 0 ? facts.workspaces.map((w) => w.dir) : [''];
  for (const f of facts.facts) if (!scopes.includes(f.scope)) scopes.push(f.scope);
  const lines: string[] = [];
  for (const scope of scopes) {
    const scoped = facts.facts.filter((f) => f.scope === scope);
    if (scoped.length === 0) continue;
    lines.push(`[${scope === '' ? 'root' : scope}]`);
    const seen = new Set<string>();
    for (const f of scoped) {
      const line = redactSecrets(`${f.key}=${String(f.value)}${metaSuffix(f)}`);
      if (seen.has(line)) continue;
      seen.add(line);
      lines.push(line);
    }
  }
  if (lines.length === 0) lines.push('(none)');
  return lines;
}

function metaSuffix(f: Fact): string {
  if (!f.meta) return '';
  const parts = Object.entries(f.meta).map(([k, v]) => `${k}: ${v}`);
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

/** Paths collapsed to depth 2: files at depth ≤ 2 are listed, deeper ones become "a/b/". */
function buildTree(paths: readonly string[]): string[] {
  const entries = new Set<string>();
  for (const p of paths) {
    if (isSensitivePath(p)) continue;
    const parts = p.split('/');
    entries.add(parts.length <= 2 ? p : `${parts[0]}/${parts[1]}/`);
  }
  const sorted = [...entries].sort();
  if (sorted.length <= MAX_TREE_ENTRIES) return sorted;
  return [
    ...sorted.slice(0, MAX_TREE_ENTRIES),
    `… (${sorted.length - MAX_TREE_ENTRIES} more entries)`,
  ];
}

interface Sample {
  path: string;
  content: string;
}

function pickSamples(facts: ProjectFacts): Sample[] {
  const files = facts.files;
  const candidates: string[] = [];
  const add = (p: string): void => {
    if (!candidates.includes(p) && files.has(p) && !isSensitivePath(p)) candidates.push(p);
  };
  const dirs = facts.workspaces.length > 0 ? facts.workspaces.map((w) => w.dir) : [''];
  for (const dir of dirs) {
    for (const e of ENTRY_POINTS) add(dir ? `${dir}/${e}` : e);
  }
  // Fill with other source files: shallow, non-test, non-generated first.
  const others = files.paths
    .filter((p) => SOURCE_EXT.test(p) && !TEST_FILE.test(p) && !GENERATED_FILE.test(p))
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  for (const p of others) add(p);

  const samples: Sample[] = [];
  for (const path of candidates) {
    if (samples.length >= MAX_SAMPLES) break;
    const raw = files.read(path);
    if (raw === undefined || raw.trim() === '') continue;
    samples.push({ path, content: truncateBytes(redactSecrets(raw), MAX_SAMPLE_BYTES) });
  }
  return samples;
}

function truncateBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text.replace(/\s+$/, '');
  const marker = '\n… (truncated)';
  const budget = maxBytes - Buffer.byteLength(marker, 'utf8');
  // Cutting mid-character yields U+FFFD; drop it.
  const s = Buffer.from(text, 'utf8').subarray(0, budget).toString('utf8').replace(/�+$/, '');
  const cut = s.lastIndexOf('\n');
  return `${cut > 0 ? s.slice(0, cut) : s}${marker}`;
}
