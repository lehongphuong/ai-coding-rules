import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';

export type Colors = ReturnType<typeof pc.createColors>;

export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
  isTTY: boolean;
  env: Record<string, string | undefined>;
}

/** Expected failure with a clean message (no stack). Exit code defaults to 2. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 2,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export interface GlobalOptions {
  cwd?: string;
  json?: boolean;
  color?: boolean;
  quiet?: boolean;
}

/** Everything a command needs: resolved cwd, output helpers, colours. */
export interface Ctx {
  io: CliIO;
  cwd: string;
  json: boolean;
  quiet: boolean;
  /** True when prompts may be shown. */
  interactive: boolean;
  c: Colors;
  /** Always printed to stdout. */
  print(text?: string): void;
  /** Informational stdout output, suppressed by --quiet and --json. */
  info(text?: string): void;
  /** Warning on stderr (not suppressed by --quiet). */
  warn(text: string): void;
}

export function colorEnabled(opts: GlobalOptions, io: CliIO): boolean {
  if (opts.color === false) return false;
  if (io.env.NO_COLOR !== undefined && io.env.NO_COLOR !== '') return false;
  if (io.env.FORCE_COLOR !== undefined && io.env.FORCE_COLOR !== '0') return true;
  return io.isTTY;
}

export function createCtx(opts: GlobalOptions, io: CliIO): Ctx {
  const cwd = resolve(io.cwd, opts.cwd ?? '.');
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
    throw new CliError(`--cwd: not a directory: ${cwd}`);
  }
  const json = Boolean(opts.json);
  const quiet = Boolean(opts.quiet);
  const c = pc.createColors(colorEnabled(opts, io));
  return {
    io,
    cwd,
    json,
    quiet,
    interactive: io.isTTY && !json,
    c,
    print: (text = '') => io.stdout(`${text}\n`),
    info: (text = '') => {
      if (!quiet && !json) io.stdout(`${text}\n`);
    },
    warn: (text) => io.stderr(`${c.yellow('warning:')} ${text}\n`),
  };
}

let cachedVersion: string | undefined;

/** Version from the nearest ai-coding-rules package.json above this module (works in src/ and dist/). */
export function packageVersion(): string {
  if (cachedVersion) return cachedVersion;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const file = join(dir, 'package.json');
    if (existsSync(file)) {
      try {
        const pkg = JSON.parse(readFileSync(file, 'utf8')) as { name?: string; version?: string };
        if (pkg.name === 'ai-coding-rules' && pkg.version) return (cachedVersion = pkg.version);
      } catch {
        // keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return '0.0.0';
    dir = parent;
  }
}

/** A command implementation: returns the exit code. `args` are positional arguments. */
export type Handler<O> = (ctx: Ctx, opts: O, args: string[]) => Promise<number> | number;

/** Wraps a handler into a commander action (builds the Ctx, records the exit code). */
export type Bind = <O>(handler: Handler<O>) => (...args: unknown[]) => Promise<void>;
