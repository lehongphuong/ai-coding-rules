import { Command, CommanderError } from 'commander';
import { registerCheck } from './commands/check.js';
import { registerDoctor } from './commands/doctor.js';
import { registerExplain } from './commands/explain.js';
import { registerGenerate } from './commands/generate.js';
import { registerScan } from './commands/scan.js';
import { CliError, createCtx, packageVersion, type Bind, type CliIO, type GlobalOptions } from './context.js';

export { CliError, type CliIO } from './context.js';

function defaultIO(): CliIO {
  return {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    cwd: process.cwd(),
    isTTY: Boolean(process.stdout.isTTY),
    env: process.env,
  };
}

/** Fresh commander program; output goes to `io`, never exits the process. */
export function createProgram(io: CliIO, bind: Bind): Command {
  const program = new Command('ai-rules')
    .description('Generate evidence-backed instruction files for AI coding agents and lint them.')
    .version(packageVersion(), '-v, --version', 'print the version')
    .option('--cwd <dir>', 'run as if started in <dir>')
    .option('--json', 'machine-readable JSON output')
    .option('--no-color', 'disable colours (also NO_COLOR, non-TTY)')
    .option('-q, --quiet', 'only print essential output')
    .helpOption('-h, --help', 'show help')
    .helpCommand('help [command]', 'show help for a command')
    .showSuggestionAfterError()
    .exitOverride()
    .configureOutput({
      writeOut: (s) => io.stdout(s),
      writeErr: (s) => io.stderr(s),
      outputError: (s, write) => write(`ai-rules: ${s.replace(/^error: /, '')}`),
      getOutHasColors: () => false,
      getErrHasColors: () => false,
    });

  registerScan(program, bind);
  registerGenerate(program, bind);
  registerDoctor(program, bind);
  registerCheck(program, bind);
  registerExplain(program, bind);
  return program;
}

/** Run the CLI; resolves to the process exit code. */
export async function run(argv: string[], ioOverrides: Partial<CliIO> = {}): Promise<number> {
  const io: CliIO = { ...defaultIO(), ...ioOverrides };
  let exitCode = 0;
  const bind: Bind = (handler) => async (...args) => {
    // commander passes (...positional, options, command)
    const cmd = args[args.length - 1] as Command;
    const positional = args.slice(0, -2).flat().map(String);
    const ctx = createCtx(cmd.optsWithGlobals<GlobalOptions>(), io);
    exitCode = await handler(ctx, cmd.opts() as Parameters<typeof handler>[1], positional);
  };

  try {
    await createProgram(io, bind).parseAsync(argv, { from: 'user' });
    return exitCode;
  } catch (err) {
    if (err instanceof CommanderError) {
      // help/version → 0; bare `ai-rules` (help on stderr) → 1; usage errors → 2
      if (err.exitCode === 0) return 0;
      return err.code === 'commander.help' ? 1 : 2;
    }
    const message = err instanceof Error ? err.message : String(err);
    io.stderr(`ai-rules: ${message}\n`);
    if (/\bai-rules\b/.test(io.env.DEBUG ?? '') && err instanceof Error && err.stack) {
      io.stderr(`${err.stack}\n`);
    }
    // ConfigError and unexpected errors → 2
    return err instanceof CliError ? err.exitCode : 2;
  }
}
