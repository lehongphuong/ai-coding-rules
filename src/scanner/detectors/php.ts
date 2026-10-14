import type { CommandKind, DetectContext, Detector, Evidence, Fact } from '../../types.js';
import { joinPath } from '../../core/index.js';
import { cleanVersion, ev, fact, inferKind, isRecord, stringMap } from '../util.js';

/** PHP: composer.json (+ artisan, phpunit.xml). */
export const phpDetector: Detector = {
  id: 'php',
  detect({ files, dir }: DetectContext): Fact[] {
    const composerPath = joinPath(dir, 'composer.json');
    const composer = files.readJson<unknown>(composerPath);
    const artisan = joinPath(dir, 'artisan');
    if (!isRecord(composer) && !files.has(artisan)) return [];
    const pkg = isRecord(composer) ? composer : {};

    const depEv = (name: string): Evidence | undefined => {
      for (const field of ['require', 'require-dev']) {
        if (name in stringMap(pkg, field)) return ev(composerPath, `#${field}.${name}`);
      }
      return undefined;
    };
    const any = (...names: string[]): Evidence | undefined => names.map(depEv).find((e) => e);

    const out: Fact[] = [];
    const phpVersion = stringMap(pkg, 'require').php;
    const manifestEv = isRecord(composer) ? ev(composerPath) : ev(artisan);
    out.push(
      fact(
        'language',
        'php',
        dir,
        [phpVersion ? ev(composerPath, '#require.php') : manifestEv],
        0.95,
        phpVersion ? { version: phpVersion } : undefined,
      ),
    );
    if (isRecord(composer))
      out.push(fact('packageManager', 'composer', dir, [ev(composerPath)], 1));

    const laravelDep = depEv('laravel/framework');
    const laravelEv = [laravelDep, files.has(artisan) ? ev(artisan) : undefined].filter(
      (e): e is Evidence => e !== undefined,
    );
    const isLaravel = laravelEv.length > 0;
    if (isLaravel) {
      const version = cleanVersion(stringMap(pkg, 'require')['laravel/framework']);
      out.push(
        fact('framework', 'laravel', dir, laravelEv, 0.95, version ? { version } : undefined),
      );
      out.push(fact('orm', 'eloquent', dir, laravelEv, 0.9));
    }
    const symfony = any('symfony/framework-bundle', 'symfony/symfony');
    if (symfony) out.push(fact('framework', 'symfony', dir, [symfony], 0.95));
    const doctrine = any('doctrine/orm', 'doctrine/doctrine-bundle');
    if (doctrine) out.push(fact('orm', 'doctrine', dir, [doctrine], 0.95));

    const pest = depEv('pestphp/pest');
    if (pest) out.push(fact('testRunner', 'pest', dir, [pest], 0.95));
    const phpunitXml = ['phpunit.xml', 'phpunit.xml.dist']
      .map((f) => joinPath(dir, f))
      .find((p) => files.has(p));
    const phpunit = [depEv('phpunit/phpunit'), phpunitXml ? ev(phpunitXml) : undefined].filter(
      (e): e is Evidence => e !== undefined,
    );
    if (phpunit.length) out.push(fact('testRunner', 'phpunit', dir, phpunit, 0.95));

    const larastan = any('larastan/larastan', 'nunomaduro/larastan');
    if (larastan) out.push(fact('linter', 'larastan', dir, [larastan], 0.95));
    const phpstan = depEv('phpstan/phpstan');
    if (phpstan) out.push(fact('linter', 'phpstan', dir, [phpstan], 0.95));
    const pint = depEv('laravel/pint');
    if (pint) out.push(fact('formatter', 'pint', dir, [pint], 0.95));
    const csFixer = depEv('friendsofphp/php-cs-fixer');
    if (csFixer) out.push(fact('formatter', 'php-cs-fixer', dir, [csFixer], 0.95));

    const cmd = (value: string, kind: CommandKind, name: string, e: Evidence[]): Fact =>
      fact('command', value, dir, e, 0.95, { kind, name });
    if (isRecord(composer))
      out.push(cmd('composer install', 'install', 'install', [ev(composerPath)]));
    if (isLaravel) out.push(cmd('php artisan test', 'test', 'test', laravelEv));
    else if (pest) out.push(cmd('./vendor/bin/pest', 'test', 'pest', [pest]));
    else if (phpunit.length) out.push(cmd('./vendor/bin/phpunit', 'test', 'phpunit', phpunit));
    if (larastan || phpstan) {
      out.push(cmd('./vendor/bin/phpstan analyse', 'lint', 'phpstan', [(larastan ?? phpstan)!]));
    }
    if (pint) out.push(cmd('./vendor/bin/pint', 'format', 'pint', [pint]));
    else if (csFixer)
      out.push(cmd('./vendor/bin/php-cs-fixer fix', 'format', 'php-cs-fixer', [csFixer]));
    if (isLaravel) out.push(cmd('php artisan migrate', 'migrate', 'migrate', laravelEv));

    for (const name of Object.keys(stringMap(pkg, 'scripts'))) {
      const kind = inferKind(name);
      if (kind)
        out.push(cmd(`composer ${name}`, kind, name, [ev(composerPath, `#scripts.${name}`)]));
    }
    return out;
  },
};
