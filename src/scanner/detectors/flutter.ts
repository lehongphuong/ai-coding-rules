import type { CommandKind, DetectContext, Detector, Evidence, Fact } from '../../types.js';
import { joinPath } from '../../core/index.js';
import { escapeRegExp, ev, fact, isRecord, lineOf, parseYaml } from '../util.js';

const STATE: [string, string][] = [
  ['flutter_riverpod', 'riverpod'],
  ['hooks_riverpod', 'riverpod'],
  ['riverpod', 'riverpod'],
  ['flutter_bloc', 'bloc'],
  ['bloc', 'bloc'],
  ['provider', 'provider'],
  ['get', 'getx'],
];

const LINT_PACKAGES: [string, string][] = [
  ['flutter_lints', 'flutter-lints'],
  ['lints', 'flutter-lints'],
  ['very_good_analysis', 'very-good-analysis'],
];

/** Dart / Flutter: pubspec.yaml + analysis_options.yaml. */
export const flutterDetector: Detector = {
  id: 'flutter',
  detect({ files, dir }: DetectContext): Fact[] {
    const pubPath = joinPath(dir, 'pubspec.yaml');
    const text = files.read(pubPath);
    const pub = parseYaml(text);
    if (!isRecord(pub)) return [];

    const deps = isRecord(pub.dependencies) ? pub.dependencies : {};
    const devDeps = isRecord(pub.dev_dependencies) ? pub.dev_dependencies : {};
    const depEv = (name: string): Evidence | undefined => {
      const field =
        name in deps ? 'dependencies' : name in devDeps ? 'dev_dependencies' : undefined;
      if (!field) return undefined;
      return ev(
        pubPath,
        `#${field}.${name}`,
        lineOf(text, new RegExp(`^\\s+${escapeRegExp(name)}\\s*:`)),
      );
    };

    const out: Fact[] = [];
    const sdk = isRecord(pub.environment) ? pub.environment.sdk : undefined;
    out.push(
      fact(
        'language',
        'dart',
        dir,
        [ev(pubPath)],
        0.95,
        typeof sdk === 'string' ? { version: sdk } : undefined,
      ),
    );
    out.push(fact('packageManager', 'pub', dir, [ev(pubPath)], 0.95));
    out.push(fact('formatter', 'dart-format', dir, [ev(pubPath)], 0.9));

    const flutterEv = depEv('flutter');
    const isFlutter = flutterEv !== undefined;
    if (flutterEv) out.push(fact('framework', 'flutter', dir, [flutterEv], 0.95));

    const testEv = depEv('flutter_test');
    if (testEv) out.push(fact('testRunner', 'flutter-test', dir, [testEv], 0.95));

    const analysis = joinPath(dir, 'analysis_options.yaml');
    const analysisText = files.read(analysis);
    for (const [pkg, value] of LINT_PACKAGES) {
      const evidence: Evidence[] = [];
      const d = depEv(pkg);
      if (d) evidence.push(d);
      const line = lineOf(analysisText, new RegExp(`package:${pkg}/`));
      if (line !== undefined) evidence.push(ev(analysis, '#include', line));
      if (evidence.length)
        out.push(fact('linter', value, dir, evidence, 0.95, { config: analysis }));
    }

    for (const [pkg, value] of STATE) {
      const d = depEv(pkg);
      if (d) out.push(fact('stateManagement', value, dir, [d], 0.95));
    }

    const tool = isFlutter ? 'flutter' : 'dart';
    const cmd = (value: string, kind: CommandKind, name: string, evidence: Evidence[]): Fact =>
      fact('command', value, dir, evidence, 0.95, { kind, name });
    out.push(cmd(`${tool} pub get`, 'install', 'pub get', [ev(pubPath)]));
    if (testEv || files.hasDir(joinPath(dir, 'test'))) {
      out.push(cmd(`${tool} test`, 'test', 'test', [testEv ?? ev(joinPath(dir, 'test'))]));
    }
    out.push(
      cmd(`${tool} analyze`, 'lint', 'analyze', [files.has(analysis) ? ev(analysis) : ev(pubPath)]),
    );
    out.push(cmd('dart format .', 'format', 'format', [ev(pubPath)]));
    const brEv = depEv('build_runner');
    if (brEv) {
      out.push(
        cmd('dart run build_runner build --delete-conflicting-outputs', 'codegen', 'build_runner', [
          brEv,
        ]),
      );
    }
    return out;
  },
};
