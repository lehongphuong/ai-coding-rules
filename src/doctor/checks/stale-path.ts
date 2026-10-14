import ignore, { type Ignore } from 'ignore';
import { DEFAULT_IGNORES } from '../../core/file-index.js';
import type { FileIndex, Finding } from '../../types.js';
import { docScope, type DoctorContext } from '../context.js';
import { dirname, resolvePath } from '../parser.js';

const IGNORED_SEGMENTS = new Set(DEFAULT_IGNORES);
const DOMAIN_RE = /^[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|io|dev|app|co|ai|sh|me)$/i;

/** stale/path: a backtick path that doesn't exist in the repo. */
export function checkStalePath(ctx: DoctorContext): Finding[] {
  const { files, workspaces } = ctx.facts;
  const gitignore = loadGitignore(files);
  const findings: Finding[] = [];
  for (const doc of ctx.docs) {
    const scope = docScope(doc, workspaces);
    const seen = new Set<string>();
    for (const claim of ctx.claimsByDoc.get(doc.path) ?? []) {
      if (claim.key !== 'path' || claim.negated) continue;
      const p = claim.value;
      const id = `${claim.line}\u0000${p}`;
      if (seen.has(id)) continue;
      seen.add(id);
      if (!checkable(p, gitignore)) continue;

      const bases = new Set(['', dirname(doc.path), scope, ...workspaces.map((w) => w.dir)]);
      const exists = [...bases].some((base) => {
        if (base === '' && p.startsWith('../')) return false;
        const r = resolvePath(base, p);
        return r !== undefined && r !== '' && existsIn(files, r);
      });
      if (exists) continue;
      findings.push({
        checkId: 'stale/path',
        severity: 'warning',
        file: doc.path,
        line: claim.line,
        message: `references \`${p}\` — no such file or directory`,
        hint: 'Update or remove the reference (it may have been moved or deleted).',
      });
    }
  }
  return findings;
}

function existsIn(files: FileIndex, p: string): boolean {
  const clean = p.replace(/\/+$/, '');
  return files.has(clean) || files.hasDir(clean);
}

function checkable(p: string, gitignore: Ignore | undefined): boolean {
  const segs = p
    .replace(/\/+$/, '')
    .split('/')
    .filter((s) => s !== '.' && s !== '..');
  if (segs.length === 0) return false;
  if (segs.some((s) => IGNORED_SEGMENTS.has(s))) return false;
  if (DOMAIN_RE.test(segs[0]!)) return false;
  if (gitignore && !p.startsWith('../')) {
    const rel = p.replace(/^\.\//, '');
    try {
      if (gitignore.ignores(rel)) return false;
    } catch {
      // invalid path for `ignore`: just check it
    }
  }
  return true;
}

function loadGitignore(files: FileIndex): Ignore | undefined {
  const text = files.read('.gitignore');
  return text === undefined ? undefined : ignore().add(text);
}
