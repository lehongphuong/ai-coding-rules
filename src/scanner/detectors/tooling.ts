import type { DetectContext, Detector, Evidence, Fact, FileIndex } from '../../types.js';
import { joinPath } from '../../core/index.js';
import { ev, fact, inferKind } from '../util.js';
import { justRecipes, makeTargets } from '../scripts.js';

export interface EditorConfigIndent {
  value: '2' | '4' | 'tab' | string;
  line: number;
}

/** Indentation from the `[*]` section of an .editorconfig. */
export function parseEditorConfigIndent(text: string): EditorConfigIndent | undefined {
  let inStar = false;
  let style: string | undefined;
  let size: string | undefined;
  let line = 0;
  text.split('\n').forEach((raw, i) => {
    const l = raw.replace(/[#;].*$/, '').trim();
    const header = /^\[(.*)\]$/.exec(l);
    if (header) {
      inStar = header[1] === '*';
      return;
    }
    if (!inStar) return;
    const kv = /^([\w_]+)\s*=\s*(\S+)$/.exec(l);
    if (!kv) return;
    const key = kv[1]!.toLowerCase();
    const value = kv[2]!.toLowerCase();
    if (key === 'indent_style') {
      style = value;
      line ||= i + 1;
    } else if (key === 'indent_size' || (key === 'tab_width' && size === undefined)) {
      size = value;
      line ||= i + 1;
    }
  });
  if (style === 'tab') return { value: 'tab', line };
  if (size && /^\d+$/.test(size) && (style === 'space' || style === undefined))
    return { value: size, line };
  return undefined;
}

const CI: [string, string][] = [
  ['.gitlab-ci.yml', 'gitlab-ci'],
  ['.circleci/config.yml', 'circleci'],
  ['.circleci/config.yaml', 'circleci'],
  ['bitbucket-pipelines.yml', 'bitbucket-pipelines'],
  ['azure-pipelines.yml', 'azure-pipelines'],
  ['azure-pipelines.yaml', 'azure-pipelines'],
];

function detectCi(files: FileIndex): Fact[] {
  const out: Fact[] = [];
  const workflows = files.glob('.github/workflows/*.{yml,yaml}');
  if (workflows.length) {
    out.push(
      fact(
        'ci',
        'github-actions',
        '',
        workflows.map((p) => ev(p)),
        1,
      ),
    );
  }
  for (const [path, value] of CI) {
    if (files.has(path)) out.push(fact('ci', value, '', [ev(path)], 1));
  }
  return out;
}

/** `make x` / `just x` commands for targets with an inferable kind. */
function taskRunnerCommands(files: FileIndex, dir: string): Fact[] {
  const out: Fact[] = [];
  const add = (tool: string, path: string, defs: { name: string; line: number }[]): void => {
    for (const { name, line } of defs) {
      const kind = inferKind(name);
      const evidence: Evidence = ev(path, `#${name}`, line);
      if (kind) out.push(fact('command', `${tool} ${name}`, dir, [evidence], 0.95, { kind, name }));
    }
  };
  for (const name of ['Makefile', 'makefile', 'GNUmakefile']) {
    const p = joinPath(dir, name);
    const text = files.read(p);
    if (text !== undefined) {
      add('make', p, makeTargets(text));
      break;
    }
  }
  for (const name of ['justfile', 'Justfile', '.justfile']) {
    const p = joinPath(dir, name);
    const text = files.read(p);
    if (text !== undefined) {
      add('just', p, justRecipes(text));
      break;
    }
  }
  return out;
}

/** Cross-stack tooling: .editorconfig, CI providers, Makefile/justfile. */
export const toolingDetector: Detector = {
  id: 'tooling',
  detect({ files, dir }: DetectContext): Fact[] {
    const out: Fact[] = [];
    const ecPath = joinPath(dir, '.editorconfig');
    const ec = files.read(ecPath);
    const indent = ec !== undefined ? parseEditorConfigIndent(ec) : undefined;
    if (indent)
      out.push(fact('indent', indent.value, dir, [ev(ecPath, '#[*]', indent.line)], 0.95));
    if (dir === '') out.push(...detectCi(files));
    out.push(...taskRunnerCommands(files, dir));
    return out;
  },
};
