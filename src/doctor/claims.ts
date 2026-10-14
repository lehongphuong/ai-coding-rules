import { BEGIN_MARKER_RE, END_MARKER_RE } from '../core/markers.js';
import type { Claim, InstructionDoc } from '../types.js';

type ClaimKey = Claim['key'];

interface Term {
  /** Regex source for the term (matched case-insensitively, with word guards). */
  re: string;
  value: string;
  /** Extra context the line must contain (besides "use X"/"with X"). */
  context?: RegExp;
}

const TEST_CONTEXT = /\b(?:tests?|testing|tested|specs?|unit|e2e|end-to-end|integration)\b/i;
const FORMAT_CONTEXT = /\bformat(?:s|ter|ters|ting|ted)?\b/i;

const TEST_RUNNERS: Term[] = [
  { re: 'jest', value: 'jest' },
  { re: 'vitest', value: 'vitest' },
  { re: 'mocha', value: 'mocha' },
  { re: 'pytest', value: 'pytest' },
  { re: 'phpunit', value: 'phpunit' },
  { re: 'pest(?:php)?', value: 'pest' },
  { re: 'flutter[ _]test', value: 'flutter-test' },
  { re: 'go test', value: 'go-test' },
  { re: 'playwright', value: 'playwright' },
  { re: 'cypress', value: 'cypress' },
  { re: 'junit\\d?', value: 'junit' },
];

const FORMATTERS: Term[] = [
  { re: 'prettier', value: 'prettier' },
  { re: 'biome', value: 'biome', context: FORMAT_CONTEXT },
  { re: 'black', value: 'black', context: FORMAT_CONTEXT },
  { re: 'ruff format', value: 'ruff-format' },
  { re: '(?:laravel )?pint', value: 'pint', context: FORMAT_CONTEXT },
  { re: 'php-cs-fixer', value: 'php-cs-fixer' },
  { re: 'dart format', value: 'dart-format' },
  { re: 'gofmt', value: 'gofmt' },
];

const LINTERS: Term[] = [
  { re: 'eslint', value: 'eslint' },
  { re: 'biome(?: lint| check)?', value: 'biome', context: /\blint/i },
  { re: 'ruff(?: check)?', value: 'ruff', context: /\blint/i },
  { re: 'flake8', value: 'flake8' },
  { re: 'pylint', value: 'pylint' },
  { re: 'phpstan', value: 'phpstan' },
  { re: 'larastan', value: 'larastan' },
  { re: 'golangci-lint', value: 'golangci-lint' },
  { re: 'ktlint', value: 'ktlint' },
  { re: 'detekt', value: 'detekt' },
  { re: 'flutter_lints', value: 'flutter-lints' },
  { re: 'very_good_analysis', value: 'very-good-analysis' },
];

const LANGUAGES: Term[] = [
  { re: 'typescript', value: 'typescript' },
  { re: 'javascript', value: 'javascript' },
  { re: 'python', value: 'python' },
  { re: 'dart', value: 'dart' },
  { re: 'php', value: 'php' },
  { re: 'kotlin', value: 'kotlin' },
  { re: 'java', value: 'java' },
];

/** Command runners recognised in backtick spans and code fences. */
const RUNNER_RE = /^(?:npm|pnpm|yarn|bun|make|just|composer|php\s+artisan|melos\s+run)(?:\s|$)/;

const NPM_SUBCOMMANDS =
  'install|i|ci|add|run|run-script|test|t|start|exec|remove|rm|uninstall|update|up|dlx|x';

/** Words in the clause before a term that negate it. */
const NEGATION_BEFORE =
  /\b(?:don'?t|do\s+not|doesn'?t|does\s+not|never|avoid|instead\s+of|rather\s+than|not|no|nor|without|stop\s+using|no\s+longer|replac\w*|(?:migrat|mov|switch|port)\w*\b.*\bfrom)\b/i;
/** "X is not used", "X is deprecated"... */
const NEGATION_AFTER =
  /^[\s\w-]{0,20}?\b(?:is|are|was|were|isn'?t|aren'?t)\s+(?:not|no\s+longer|deprecated|removed|forbidden|banned|gone)\b|^\s*(?:isn'?t|aren'?t)\b|^\s*\((?:deprecated|legacy|removed)\)/i;
const LANGUAGE_QUALIFIER =
  /\b(?:python|py|go|golang|ya?ml|json|make(?:file)?s?|php|dart|java|kotlin|ruby|rust|markdown|md|html|css|scss|sql|shell|bash|c#|swift|xml)\b/i;
const CLAUSE_BREAK = /[.;!?](?=\s|$)|[,:()|—–]|\s-\s/g;

interface LineCtx {
  line: number;
  /** Line with inline HTML comments removed and curly quotes normalised. */
  clean: string;
  raw: string;
  heading: string;
}

/** Extract claims from one parsed instruction file (SPEC §6.3). */
export function extractClaims(doc: InstructionDoc): Claim[] {
  const claims: Claim[] = [];
  const seen = new Set<string>();
  const push = (ctx: LineCtx, key: ClaimKey, value: string, negated: boolean): void => {
    const id = `${ctx.line}\u0000${key}\u0000${value}\u0000${negated}`;
    if (seen.has(id)) return;
    seen.add(id);
    claims.push({ key, value, negated, file: doc.path, line: ctx.line, text: ctx.raw.trim() });
  };

  const bodyStart = bodyStartOf(doc);
  const headingAt = headingLookup(doc);
  for (let i = bodyStart; i < doc.lines.length; i++) {
    const raw = doc.lines[i]!;
    const n = i + 1;
    const trimmed = raw.trim();
    if (!trimmed || BEGIN_MARKER_RE.test(trimmed) || END_MARKER_RE.test(trimmed)) continue;
    const ctx: LineCtx = {
      line: n,
      raw,
      clean: raw.replace(/<!--.*?(?:-->|$)/g, ' ').replace(/[‘’]/g, "'"),
      heading: headingAt(n),
    };

    if (doc.codeLines.has(n)) {
      // Inside code fences only commands count (they are real references).
      for (const cmd of commandsInCode(ctx.clean)) push(ctx, 'command', cmd, false);
      continue;
    }

    for (const span of backtickSpans(ctx.clean)) {
      const negated = isNegated(ctx.clean, span.index, span.text.length + 2);
      for (const cmd of splitCommands(span.text)) {
        if (RUNNER_RE.test(cmd)) push(ctx, 'command', cmd, negated);
      }
      const path = asPath(span.text);
      if (path) push(ctx, 'path', path, negated);
    }

    extractPackageManagers(ctx, push);
    extractTerms(
      ctx,
      'testRunner',
      TEST_RUNNERS,
      push,
      (c) => TEST_CONTEXT.test(c.clean) || /test|spec/i.test(c.heading),
    );
    extractTerms(ctx, 'formatter', FORMATTERS, push, () => true);
    extractTerms(ctx, 'linter', LINTERS, push, () => true);
    extractLanguages(ctx, push);
    extractStyle(ctx, push);
  }
  return claims;
}

type Push = (ctx: LineCtx, key: ClaimKey, value: string, negated: boolean) => void;

function extractPackageManagers(ctx: LineCtx, push: Push): void {
  const s = ctx.clean;
  const patterns: RegExp[] = [
    new RegExp(`(?<![\\w./@-])(npm)\\s+(?:${NPM_SUBCOMMANDS})(?![\\w-])`, 'gi'),
    /(?<![\w./@-])(pnpm|yarn|bun)\s+(?:-{1,2}[\w-]+(?:[= ]\S+)?\s+)*[a-z][\w:-]*/gi,
    /\b(?:use|using|uses|prefer)\s+(npm|pnpm|yarn|bun)(?![\w-]|[./]\w)/gi,
    /\b(?:instead\s+of|rather\s+than|avoid|not)\s+(npm|pnpm|yarn|bun)(?![\w-]|[./]\w)/gi,
    /\bpackage[\s-]+manager\b[^.;]*?\b(npm|pnpm|yarn|bun)(?![\w-]|[./]\w)/gi,
  ];
  for (const re of patterns) {
    for (const m of s.matchAll(re)) {
      const whole = m[0];
      // Global installs ("npm i -g x") say nothing about the project's manager.
      const rest = s.slice(m.index!, m.index! + whole.length + 40);
      if (/^\S+\s+(?:i|install|add)\b[^`|;&]*\s(?:-g|--global)\b/i.test(rest)) continue;
      if (/^\S+\s+global\b/i.test(whole)) continue;
      const value = m[1]!.toLowerCase();
      const at = m.index! + whole.toLowerCase().lastIndexOf(value);
      push(ctx, 'packageManager', value, isNegated(s, at, value.length));
    }
  }
}

function extractTerms(
  ctx: LineCtx,
  key: ClaimKey,
  terms: Term[],
  push: Push,
  context: (c: LineCtx) => boolean,
): void {
  const s = ctx.clean;
  for (const t of terms) {
    const re = new RegExp(`(?<![\\w./@-])(?:${t.re})(?![\\w-]|[./]\\w)`, 'gi');
    for (const m of s.matchAll(re)) {
      const imperative = new RegExp(`\\b(?:use|using|with|prefer)\\s+(?:${t.re})\\b`, 'i').test(
        s.slice(Math.max(0, m.index! - 12), m.index! + m[0].length + 1),
      );
      if (!imperative && !context(ctx)) continue;
      if (!imperative && t.context && !t.context.test(s)) continue;
      push(ctx, key, t.value, isNegated(s, m.index!, m[0].length));
    }
  }
}

function extractLanguages(ctx: LineCtx, push: Push): void {
  const s = ctx.clean;
  for (const t of LANGUAGES) {
    const re = new RegExp(
      `\\b(?:use|using|write|written\\s+in|prefer)\\s+(${t.re})\\b|\\b(${t.re})\\s+only\\b`,
      'gi',
    );
    for (const m of s.matchAll(re)) {
      const term = (m[1] ?? m[2])!;
      const at = m.index! + m[0].toLowerCase().indexOf(term.toLowerCase());
      push(ctx, 'language', t.value, isNegated(s, at, term.length));
    }
  }
}

function extractStyle(ctx: LineCtx, push: Push): void {
  const s = ctx.clean;
  // Language-specific indentation ("Python: 4 spaces") says nothing about the repo default.
  const qualified = LANGUAGE_QUALIFIER.test(s);
  const indentCtx = !qualified && /\bindent/i.test(s);
  for (const m of s.matchAll(/\b([248])[- ]spaces?\b/gi)) {
    const imperative = !qualified && /\buse\s+$/i.test(s.slice(0, m.index!));
    if (indentCtx || imperative) push(ctx, 'indent', m[1]!, isNegated(s, m.index!, m[0].length));
  }
  for (const m of s.matchAll(/\btabs\b/gi)) {
    const imperative = !qualified && /\buse\s+$/i.test(s.slice(0, m.index!));
    if (indentCtx || imperative) push(ctx, 'indent', 'tab', isNegated(s, m.index!, m[0].length));
  }
  if (/\b(?:use|prefer|always|strings?)\b/i.test(s)) {
    for (const m of s.matchAll(/\b(single|double)[- ]quot(?:es|ed|e)\b/gi)) {
      push(ctx, 'quotes', m[1]!.toLowerCase(), isNegated(s, m.index!, m[0].length));
    }
  }
  // "no semicolons" is a positive claim with value "never".
  const never =
    /\b(?:no|without|omit(?:ting)?|avoid|don'?t\s+use|do\s+not\s+use|never\s+use)\s+(?:trailing\s+)?semicolons?\b/i;
  if (never.test(s)) push(ctx, 'semicolons', 'never', false);
  else if (/\b(?:always\s+use|use|require|with)\s+(?:trailing\s+)?semicolons\b/i.test(s)) {
    push(ctx, 'semicolons', 'always', false);
  }
}

/** True if the term at `index` is negated within its clause. */
export function isNegated(line: string, index: number, length: number): boolean {
  let start = 0;
  for (const m of line.matchAll(CLAUSE_BREAK)) {
    if (m.index! + m[0].length <= index) start = m.index! + m[0].length;
  }
  if (NEGATION_BEFORE.test(line.slice(start, index))) return true;
  let after = line.slice(index + length);
  const brk = after.search(/[.;!?](?=\s|$)|[,:|—–]|\s-\s/);
  if (brk !== -1) after = after.slice(0, brk + 1);
  return NEGATION_AFTER.test(after);
}

function backtickSpans(line: string): { text: string; index: number }[] {
  const out: { text: string; index: number }[] = [];
  for (const m of line.matchAll(/(`+)([^`]+?)\1(?!`)/g)) {
    const text = m[2]!.trim();
    if (text) out.push({ text, index: m.index! });
  }
  return out;
}

/** Split "a && b; c || d | e" into individual command strings. */
function splitCommands(text: string): string[] {
  return text
    .split(/\s*(?:&&|\|\||;|\|)\s*/)
    .map((c) => c.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

function commandsInCode(line: string): string[] {
  let s = line.trim().replace(/^(?:\$|>|%|#)\s+/, '');
  s = s.replace(/\s+#.*$/, '');
  return splitCommands(s).filter((c) => RUNNER_RE.test(c));
}

const DIR_PREFIXES = /^(?:\.\/|\.\.\/)/;

/** The span as a repo path claim, or undefined if it doesn't look like one. */
function asPath(text: string): string | undefined {
  let p = text.replace(/:\d+(?::\d+)?$/, '');
  if (/\s/.test(p) || !p.includes('/')) return undefined;
  if (/[*?{}[\]<>$|'"=,`]/.test(p)) return undefined;
  if (/^(?:[a-z][\w+.-]*:|www\.|~|\/|@)/i.test(p)) return undefined;
  if (/(^|\/)node_modules(\/|$)/.test(p)) return undefined;
  const isDir = p.endsWith('/');
  const hasExt = /\/?[^/]*[A-Za-z0-9_-]\.[A-Za-z][A-Za-z0-9]{0,7}$/.test(p);
  if (!isDir && !hasExt) return undefined;
  if (!p.split('/').every((seg) => seg === '' || /^[\w.@()+-]+$/.test(seg))) return undefined;
  if (!/[A-Za-z]/.test(p)) return undefined;
  if (DIR_PREFIXES.test(p) && !p.startsWith('../')) p = p.slice(2);
  return p;
}

function bodyStartOf(doc: InstructionDoc): number {
  if (!doc.frontMatter && doc.lines[0]?.trim() !== '---') return 0;
  const end = doc.lines.findIndex((l, i) => i > 0 && (l.trim() === '---' || l.trim() === '...'));
  return end === -1 ? 0 : end + 1;
}

function headingLookup(doc: InstructionDoc): (line: number) => string {
  return (line) => {
    // Nearest heading chain: concatenate headings of enclosing sections.
    const stack: { level: number; heading: string }[] = [];
    for (const s of doc.sections) {
      if (s.startLine > line) break;
      while (stack.length && stack[stack.length - 1]!.level >= s.level) stack.pop();
      stack.push({ level: s.level, heading: s.heading });
    }
    return stack.map((s) => s.heading).join(' / ');
  };
}
