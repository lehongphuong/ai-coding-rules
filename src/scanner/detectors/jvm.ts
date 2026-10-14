import type { CommandKind, DetectContext, Detector, Evidence, Fact } from '../../types.js';
import { joinPath } from '../../core/index.js';
import { ev, fact, firstExisting, lineOf } from '../util.js';

const GRADLE_FILES = ['build.gradle.kts', 'build.gradle'];

/** Java / Kotlin: Gradle and Maven builds. */
export const jvmDetector: Detector = {
  id: 'jvm',
  detect({ files, dir }: DetectContext): Fact[] {
    const gradle = firstExisting(files, dir, GRADLE_FILES);
    const pom = firstExisting(files, dir, ['pom.xml']);
    const build = gradle ?? pom;
    if (!build) return [];

    // Android projects keep plugins/deps in app/build.gradle(.kts).
    const buildFiles = [
      build,
      firstExisting(
        files,
        dir,
        GRADLE_FILES.map((f) => `app/${f}`),
      ),
    ].filter((p): p is string => p !== undefined);
    const find = (re: RegExp): Evidence | undefined => {
      for (const p of buildFiles) {
        const line = lineOf(files.read(p), re);
        if (line !== undefined) return ev(p, undefined, line);
      }
      return undefined;
    };

    const out: Fact[] = [];
    const kotlin =
      find(/org\.jetbrains\.kotlin|kotlin\(|kotlin-stdlib/) ??
      (files.hasDir(joinPath(dir, 'src/main/kotlin'))
        ? ev(joinPath(dir, 'src/main/kotlin'))
        : undefined);
    if (kotlin) out.push(fact('language', 'kotlin', dir, [kotlin], 0.95));
    const javaDir = joinPath(dir, 'src/main/java');
    if (files.hasDir(javaDir) || !kotlin) {
      out.push(
        fact(
          'language',
          'java',
          dir,
          [files.hasDir(javaDir) ? ev(javaDir) : ev(build)],
          files.hasDir(javaDir) ? 0.95 : 0.8,
        ),
      );
    }
    out.push(fact('packageManager', gradle ? 'gradle' : 'maven', dir, [ev(build)], 1));

    const spring = find(/org\.springframework\.boot|spring-boot/);
    if (spring) out.push(fact('framework', 'spring', dir, [spring], 0.95));
    const android = find(/com\.android\.(application|library)/);
    if (android) out.push(fact('framework', 'android', dir, [android], 0.95));
    const junit = find(/junit|spring-boot-starter-test/);
    if (junit) out.push(fact('testRunner', 'junit', dir, [junit], 0.95));
    const ktlint = find(/ktlint/);
    if (ktlint) {
      out.push(fact('linter', 'ktlint', dir, [ktlint], 0.95));
      out.push(fact('formatter', 'ktlint', dir, [ktlint], 0.95));
    }
    const detekt = find(/detekt/);
    if (detekt) out.push(fact('linter', 'detekt', dir, [detekt], 0.95));

    const cmd = (value: string, kind: CommandKind, name: string): Fact =>
      fact('command', value, dir, [ev(build)], 0.95, { kind, name });
    if (gradle) {
      const g = files.has(joinPath(dir, 'gradlew')) ? './gradlew' : 'gradle';
      out.push(cmd(`${g} test`, 'test', 'test'), cmd(`${g} build`, 'build', 'build'));
      if (ktlint) out.push(cmd(`${g} ktlintCheck`, 'lint', 'ktlintCheck'));
      if (detekt) out.push(cmd(`${g} detekt`, 'lint', 'detekt'));
    } else {
      const m = files.has(joinPath(dir, 'mvnw')) ? './mvnw' : 'mvn';
      out.push(cmd(`${m} test`, 'test', 'test'), cmd(`${m} package`, 'build', 'package'));
    }
    return out;
  },
};
