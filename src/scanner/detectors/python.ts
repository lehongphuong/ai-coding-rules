import type {
  CommandKind,
  DetectContext,
  Detector,
  Evidence,
  Fact,
  FileIndex,
} from '../../types.js';
import { joinPath } from '../../core/index.js';
import { ev, fact, lineOf } from '../util.js';

export interface PyDep {
  /** Normalised name: lowercase, "_" → "-", extras stripped. */
  name: string;
  evidence: Evidence;
}

export interface PyProject {
  deps: PyDep[];
  /** Section headers present, e.g. "tool.ruff", "tool.poetry". */
  sections: Map<string, number>;
  name?: string;
  description?: string;
  requiresPython?: string;
}

const ARRAY_SECTIONS = /^(project|project\.optional-dependencies|dependency-groups)$/;
const TABLE_SECTIONS = /^tool\.poetry\.(dependencies|dev-dependencies|group\.[^.]+\.dependencies)$/;

/** Normalise a requirement string ("FastAPI[all]>=0.1") to a package name. */
export function pyName(spec: string): string | undefined {
  const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(spec);
  return m ? m[1]!.toLowerCase().replace(/[_.]/g, '-') : undefined;
}

/**
 * Minimal pyproject.toml reader (no TOML dependency): section headers,
 * dependency arrays and poetry dependency tables.
 */
export function parsePyproject(text: string, path: string): PyProject {
  const result: PyProject = { deps: [], sections: new Map() };
  let section = '';
  let arrayKey: string | undefined;
  const lines = text.split('\n');
  const addStrings = (line: string, lineNo: number, pointer: string): void => {
    for (const m of line.matchAll(/["']([^"']+)["']/g)) {
      const name = pyName(m[1]!);
      if (name) result.deps.push({ name, evidence: ev(path, `#${pointer}`, lineNo) });
    }
  };

  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (arrayKey !== undefined) {
      addStrings(line.replace(/\].*$/, ''), lineNo, `${section}.${arrayKey}`);
      if (line.includes(']')) arrayKey = undefined;
      return;
    }
    const header = /^\[\[?([^\]]+)\]\]?$/.exec(line);
    if (header) {
      section = header[1]!.trim().replace(/["']/g, '');
      if (!result.sections.has(section)) result.sections.set(section, lineNo);
      return;
    }
    const kv = /^([A-Za-z0-9_.-]+|"[^"]+")\s*=\s*(.*)$/.exec(line);
    if (!kv) return;
    const key = kv[1]!.replace(/"/g, '');
    const value = kv[2]!;
    if (section === 'project') {
      if (key === 'name') result.name = unquote(value);
      if (key === 'description') result.description = unquote(value);
      if (key === 'requires-python') result.requiresPython = unquote(value);
    }
    if (ARRAY_SECTIONS.test(section) && (section !== 'project' || key === 'dependencies')) {
      if (value.startsWith('[')) {
        addStrings(value.slice(1).replace(/\].*$/, ''), lineNo, `${section}.${key}`);
        if (!value.includes(']')) arrayKey = key;
      }
    } else if (TABLE_SECTIONS.test(section) && key !== 'python') {
      const name = pyName(key);
      if (name) result.deps.push({ name, evidence: ev(path, `#${section}.${key}`, lineNo) });
    } else if (section === 'tool.poetry' && key === 'name' && !result.name) {
      result.name = unquote(value);
    }
  });
  return result;
}

function unquote(v: string): string {
  return v.trim().replace(/^["']|["']$/g, '');
}

/** Names from requirements*.txt. */
function parseRequirements(text: string, path: string): PyDep[] {
  const out: PyDep[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line || line.startsWith('-')) return;
    const name = pyName(line);
    if (name) out.push({ name, evidence: ev(path, undefined, i + 1) });
  });
  return out;
}

/** Package names from Pipfile [packages] / [dev-packages]. */
function parsePipfile(text: string, path: string): PyDep[] {
  const out: PyDep[] = [];
  let section = '';
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      section = header[1]!;
      return;
    }
    if (section !== 'packages' && section !== 'dev-packages') return;
    const kv = /^([A-Za-z0-9_.-]+|"[^"]+")\s*=/.exec(line);
    const name = kv ? pyName(kv[1]!.replace(/"/g, '')) : undefined;
    if (name) out.push({ name, evidence: ev(path, `#${section}.${name}`, i + 1) });
  });
  return out;
}

type PyPm = 'uv' | 'poetry' | 'pipenv' | 'pip';

const RUN_PREFIX: Record<PyPm, string> = {
  uv: 'uv run ',
  poetry: 'poetry run ',
  pipenv: 'pipenv run ',
  pip: '',
};

function requirementFiles(files: FileIndex, dir: string): string[] {
  return files
    .list(dir)
    .filter((n) => /^requirements.*\.txt$/.test(n))
    .map((n) => joinPath(dir, n))
    .filter((p) => files.has(p));
}

/** Python: pyproject.toml, requirements*.txt, Pipfile, uv.lock, poetry.lock. */
export const pythonDetector: Detector = {
  id: 'python',
  detect({ files, dir }: DetectContext): Fact[] {
    const pyprojectPath = joinPath(dir, 'pyproject.toml');
    const pipfilePath = joinPath(dir, 'Pipfile');
    const uvLock = joinPath(dir, 'uv.lock');
    const poetryLock = joinPath(dir, 'poetry.lock');
    const setupPy = joinPath(dir, 'setup.py');
    const reqs = requirementFiles(files, dir);
    const pyText = files.read(pyprojectPath);
    const pipText = files.read(pipfilePath);
    if (pyText === undefined && pipText === undefined && reqs.length === 0 && !files.has(setupPy))
      return [];

    const py = pyText !== undefined ? parsePyproject(pyText, pyprojectPath) : undefined;
    const deps: PyDep[] = [
      ...(py?.deps ?? []),
      ...(pipText !== undefined ? parsePipfile(pipText, pipfilePath) : []),
      ...reqs.flatMap((p) => parseRequirements(files.read(p) ?? '', p)),
    ];
    const depEv = (...names: string[]): Evidence[] =>
      deps.filter((d) => names.includes(d.name)).map((d) => d.evidence);
    const sectionEv = (name: string): Evidence[] => {
      const line = py?.sections.get(name);
      return line !== undefined ? [ev(pyprojectPath, `#${name}`, line)] : [];
    };
    const fileEv = (...names: string[]): Evidence[] =>
      names
        .map((n) => joinPath(dir, n))
        .filter((p) => files.has(p))
        .map((p) => ev(p));

    const manifest = files.has(pyprojectPath)
      ? pyprojectPath
      : files.has(pipfilePath)
        ? pipfilePath
        : (reqs[0] ?? setupPy);
    const out: Fact[] = [];
    const versionFile = joinPath(dir, '.python-version');
    const version = py?.requiresPython ?? files.read(versionFile)?.trim();
    const langEv = py?.requiresPython
      ? ev(pyprojectPath, '#project.requires-python', lineOf(pyText, /^requires-python\s*=/))
      : ev(manifest);
    out.push(fact('language', 'python', dir, [langEv], 0.95, version ? { version } : undefined));

    // package manager
    let pm: PyPm = 'pip';
    let pmEv: Evidence[] = [ev(manifest)];
    let pmConf = 0.7;
    if (files.has(uvLock) || sectionEv('tool.uv').length) {
      pm = 'uv';
      pmEv = [...fileEv('uv.lock'), ...sectionEv('tool.uv')];
      pmConf = 1;
    } else if (files.has(poetryLock) || sectionEv('tool.poetry').length) {
      pm = 'poetry';
      pmEv = [...fileEv('poetry.lock'), ...sectionEv('tool.poetry')];
      pmConf = 1;
    } else if (pipText !== undefined) {
      pm = 'pipenv';
      pmEv = [ev(pipfilePath)];
      pmConf = 0.95;
    }
    out.push(fact('packageManager', pm, dir, pmEv, pmConf));

    const add = (
      key: Fact['key'],
      value: string,
      evidence: Evidence[],
      confidence = 0.95,
    ): boolean => {
      if (evidence.length === 0) return false;
      out.push(fact(key, value, dir, evidence, confidence));
      return true;
    };

    add('framework', 'django', [...depEv('django'), ...fileEv('manage.py')]);
    add('framework', 'fastapi', depEv('fastapi'));
    add('framework', 'flask', depEv('flask'));
    const pytest = add('testRunner', 'pytest', [
      ...depEv('pytest'),
      ...sectionEv('tool.pytest.ini_options'),
      ...fileEv('pytest.ini', 'conftest.py'),
    ]);
    const ruff = add('linter', 'ruff', [
      ...depEv('ruff'),
      ...sectionEv('tool.ruff'),
      ...fileEv('ruff.toml', '.ruff.toml'),
    ]);
    add('linter', 'flake8', [...depEv('flake8'), ...fileEv('.flake8')]);
    add('linter', 'pylint', [...depEv('pylint'), ...fileEv('.pylintrc')]);
    const black = add('formatter', 'black', [...depEv('black'), ...sectionEv('tool.black')]);
    let ruffFormat = add('formatter', 'ruff-format', sectionEv('tool.ruff.format'));
    if (!ruffFormat && ruff && !black) {
      ruffFormat = add(
        'formatter',
        'ruff-format',
        [...depEv('ruff'), ...sectionEv('tool.ruff')],
        0.7,
      );
    }
    add('orm', 'sqlalchemy', depEv('sqlalchemy', 'sqlmodel'));
    if (out.some((f) => f.key === 'framework' && f.value === 'django')) {
      add('orm', 'django-orm', [...depEv('django'), ...fileEv('manage.py')], 0.9);
    }

    // commands
    const run = RUN_PREFIX[pm];
    const cmd = (
      value: string,
      kind: CommandKind,
      name: string,
      evidence: Evidence[],
      confidence = 0.95,
    ): void => {
      out.push(fact('command', value, dir, evidence, confidence, { kind, name }));
    };
    const install: Record<PyPm, string> = {
      uv: 'uv sync',
      poetry: 'poetry install',
      pipenv: 'pipenv install --dev',
      pip: reqs.some((r) => r.endsWith('/requirements.txt') || r === 'requirements.txt')
        ? 'pip install -r requirements.txt'
        : 'pip install -e .',
    };
    cmd(install[pm], 'install', 'install', pmEv, pmConf);
    if (pytest)
      cmd(`${run}pytest`, 'test', 'pytest', out.find((f) => f.value === 'pytest')!.evidence);
    if (ruff)
      cmd(`${run}ruff check .`, 'lint', 'ruff', out.find((f) => f.value === 'ruff')!.evidence);
    if (black)
      cmd(`${run}black .`, 'format', 'black', out.find((f) => f.value === 'black')!.evidence);
    else if (ruffFormat)
      cmd(
        `${run}ruff format .`,
        'format',
        'ruff-format',
        out.find((f) => f.value === 'ruff-format')!.evidence,
      );
    const managePy = fileEv('manage.py');
    if (managePy.length) cmd(`${run}python manage.py migrate`, 'migrate', 'migrate', managePy);
    return out;
  },
};
