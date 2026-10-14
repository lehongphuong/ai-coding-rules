import type { CommandKind, DetectContext, Detector, Evidence, Fact } from '../../types.js';
import { joinPath } from '../../core/index.js';
import { ev, fact, firstExisting, lineOf } from '../util.js';

const GOLANGCI = ['.golangci.yml', '.golangci.yaml', '.golangci.toml', '.golangci.json'];

/** Go: go.mod, .golangci.*. */
export const goDetector: Detector = {
  id: 'go',
  detect({ files, dir }: DetectContext): Fact[] {
    const modPath = joinPath(dir, 'go.mod');
    const text = files.read(modPath);
    if (text === undefined) return [];
    const modEv = ev(modPath);
    const out: Fact[] = [];

    const goLine = lineOf(text, /^go\s+\d/);
    const version = /^go\s+(\S+)/m.exec(text)?.[1];
    out.push(
      fact(
        'language',
        'go',
        dir,
        [ev(modPath, '#go', goLine)],
        0.95,
        version ? { version } : undefined,
      ),
    );
    out.push(fact('packageManager', 'go', dir, [modEv], 0.95));
    out.push(fact('formatter', 'gofmt', dir, [modEv], 0.9));

    const prefix = dir ? `${dir}/` : '';
    const testFile = files.paths.find((p) => p.startsWith(prefix) && p.endsWith('_test.go'));
    out.push(
      fact('testRunner', 'go-test', dir, [testFile ? ev(testFile) : modEv], testFile ? 0.95 : 0.9),
    );

    const lintCfg = firstExisting(files, dir, GOLANGCI);
    if (lintCfg)
      out.push(fact('linter', 'golangci-lint', dir, [ev(lintCfg)], 0.95, { config: lintCfg }));

    const gormLine = lineOf(text, /gorm\.io\/gorm/);
    if (gormLine !== undefined)
      out.push(fact('orm', 'gorm', dir, [ev(modPath, '#require.gorm.io/gorm', gormLine)], 0.95));

    const cmd = (value: string, kind: CommandKind, name: string, e: Evidence[]): Fact =>
      fact('command', value, dir, e, 0.95, { kind, name });
    out.push(cmd('go mod download', 'install', 'mod download', [modEv]));
    out.push(cmd('go test ./...', 'test', 'test', [testFile ? ev(testFile) : modEv]));
    out.push(cmd('go build ./...', 'build', 'build', [modEv]));
    out.push(cmd('go vet ./...', 'lint', 'vet', [modEv]));
    if (lintCfg) out.push(cmd('golangci-lint run', 'lint', 'golangci-lint', [ev(lintCfg)]));
    out.push(cmd('gofmt -w .', 'format', 'gofmt', [modEv]));
    return out;
  },
};
